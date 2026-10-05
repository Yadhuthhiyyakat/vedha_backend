import { supabaseAdmin } from "../config/supabase.js";

export interface LinkedDevice {
  id: string;
  userId: string;
  deviceName: string;
  deviceId: string;
  platform: string;
  status: "active" | "revoked";
  pairedAt: string;
  lastActive: string;
}

// In-memory cache for ultra-fast checks and fallback
const devicesStore = new Map<string, LinkedDevice>();

export const DeviceService = {
  registerDevice: async (params: {
    userId: string;
    deviceName?: string;
    deviceId?: string;
    platform?: string;
  }): Promise<LinkedDevice> => {
    const deviceId = params.deviceId || `dev_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const deviceName = params.deviceName || "Mobile Device (Android/iOS)";
    const platform = params.platform || "android";

    // 1. Persist to Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from("user_devices")
        .insert({
          user_id: params.userId,
          device_name: deviceName,
          device_id: deviceId,
          platform: platform,
          status: "active",
          paired_at: now,
          last_active: now,
        })
        .select()
        .single();

      if (!error && data) {
        const dev: LinkedDevice = {
          id: data.id,
          userId: data.user_id,
          deviceName: data.device_name,
          deviceId: data.device_id,
          platform: data.platform,
          status: data.status,
          pairedAt: data.paired_at,
          lastActive: data.last_active,
        };
        devicesStore.set(dev.id, dev);
        return dev;
      }
    } catch (e) {
      console.error("[DeviceService.registerDevice] Supabase error:", e);
    }

    // Fallback to memory
    const fallbackId = `link_${Math.random().toString(36).substring(2, 10)}`;
    const fallbackDev: LinkedDevice = {
      id: fallbackId,
      userId: params.userId,
      deviceName,
      deviceId,
      platform,
      status: "active",
      pairedAt: now,
      lastActive: now,
    };
    devicesStore.set(fallbackId, fallbackDev);
    return fallbackDev;
  },

  getDevicesForUser: async (userId: string): Promise<LinkedDevice[]> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_devices")
        .select("*")
        .eq("user_id", userId)
        .order("paired_at", { ascending: false });

      if (!error && data) {
        const list: LinkedDevice[] = data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          deviceName: d.device_name,
          deviceId: d.device_id,
          platform: d.platform,
          status: d.status,
          pairedAt: d.paired_at,
          lastActive: d.last_active,
        }));

        for (const dev of list) {
          devicesStore.set(dev.id, dev);
        }
        return list;
      }
    } catch (e) {
      console.error("[DeviceService.getDevicesForUser] Supabase error:", e);
    }

    // Fallback to memory
    const list: LinkedDevice[] = [];
    for (const dev of devicesStore.values()) {
      if (dev.userId === userId) {
        list.push(dev);
      }
    }
    return list.sort((a, b) => new Date(b.pairedAt).getTime() - new Date(a.pairedAt).getTime());
  },

  revokeDevice: async (userId: string, deviceIdOrLinkId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_devices")
        .update({ status: "revoked", last_active: new Date().toISOString() })
        .eq("user_id", userId)
        .or(`id.eq.${deviceIdOrLinkId},device_id.eq.${deviceIdOrLinkId}`)
        .select();

      if (!error && data && data.length > 0) {
        for (const dev of devicesStore.values()) {
          if (dev.userId === userId && (dev.id === deviceIdOrLinkId || dev.deviceId === deviceIdOrLinkId)) {
            dev.status = "revoked";
            dev.lastActive = new Date().toISOString();
          }
        }
        return true;
      }
    } catch (e) {
      console.error("[DeviceService.revokeDevice] Supabase error:", e);
    }

    // Fallback to memory
    for (const dev of devicesStore.values()) {
      if (dev.userId === userId && (dev.id === deviceIdOrLinkId || dev.deviceId === deviceIdOrLinkId)) {
        dev.status = "revoked";
        dev.lastActive = new Date().toISOString();
        return true;
      }
    }
    return false;
  },

  isDeviceActive: async (userId: string, deviceId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_devices")
        .select("status")
        .eq("user_id", userId)
        .eq("device_id", deviceId)
        .single();

      if (!error && data) {
        return data.status === "active";
      }
    } catch (_) {}

    for (const dev of devicesStore.values()) {
      if (dev.userId === userId && dev.deviceId === deviceId) {
        return dev.status === "active";
      }
    }
    return true;
  },
};
