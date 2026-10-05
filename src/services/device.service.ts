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

const devicesStore = new Map<string, LinkedDevice>();

export const DeviceService = {
  registerDevice: (params: {
    userId: string;
    deviceName?: string;
    deviceId?: string;
    platform?: string;
  }): LinkedDevice => {
    const deviceId = params.deviceId || `dev_${Math.random().toString(36).substring(2, 10)}`;
    const id = `link_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const newDevice: LinkedDevice = {
      id,
      userId: params.userId,
      deviceName: params.deviceName || "Mobile Device (Android/iOS)",
      deviceId,
      platform: params.platform || "android",
      status: "active",
      pairedAt: now,
      lastActive: now,
    };

    devicesStore.set(id, newDevice);
    return newDevice;
  },

  getDevicesForUser: (userId: string): LinkedDevice[] => {
    const list: LinkedDevice[] = [];
    for (const dev of devicesStore.values()) {
      if (dev.userId === userId) {
        list.push(dev);
      }
    }
    return list.sort((a, b) => new Date(b.pairedAt).getTime() - new Date(a.pairedAt).getTime());
  },

  revokeDevice: (userId: string, deviceIdOrLinkId: string): boolean => {
    for (const dev of devicesStore.values()) {
      if (dev.userId === userId && (dev.id === deviceIdOrLinkId || dev.deviceId === deviceIdOrLinkId)) {
        dev.status = "revoked";
        dev.lastActive = new Date().toISOString();
        return true;
      }
    }
    return false;
  },

  isDeviceActive: (userId: string, deviceId: string): boolean => {
    for (const dev of devicesStore.values()) {
      if (dev.userId === userId && dev.deviceId === deviceId) {
        return dev.status === "active";
      }
    }
    return true;
  },
};
