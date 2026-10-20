import os from "node:os";

/**
 * Lấy địa chỉ IP mạng nội bộ (LAN IPv4) của máy chủ để các thiết bị khác (điện thoại quét QR)
 * có thể truy cập được khi kết nối chung mạng Wi-Fi.
 */
export function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    // Bỏ qua các interface ảo VMware, VirtualBox, WSL, Loopback
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes("vmnet") ||
      lowerName.includes("vEthernet") ||
      lowerName.includes("wsl") ||
      lowerName.includes("virtual") ||
      lowerName.includes("docker")
    ) {
      continue;
    }
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254")) {
        return net.address;
      }
    }
  }
  return "localhost";
}
