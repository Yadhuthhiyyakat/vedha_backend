import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { DeviceService } from "../services/device.service.js";

export const getLinkedDevices = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const devices = await DeviceService.getDevicesForUser(userId);
  res.json({
    devices,
    total: devices.length,
    active: devices.filter((d) => d.status === "active").length,
  });
};

export const revokeDevice = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { deviceId } = req.params as { deviceId: string };

  const success = await DeviceService.revokeDevice(userId, deviceId);
  if (!success) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  res.json({ message: "Device successfully revoked", deviceId, status: "revoked" });
};
