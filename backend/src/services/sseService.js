/**
 * SCRUM-173 / T-83: Real-time Server-Sent Events (SSE) Handler.
 * Quản lý danh sách kết nối SSE mở từ các trình duyệt của người dùng.
 * Tự động broadcast thông báo khi có lệnh thu hồi mới hoặc khi có lô được niêm phong.
 */

const clients = new Set();

export function registerSseClient(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Gửi thông điệp chào mừng khởi tạo kết nối
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "SSE connected", time: new Date().toISOString() })}\n\n`);

  clients.add(res);

  // Heartbeat ping mỗi 25 giây để chống ngắt kết nối
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function broadcastRecallEvent(eventType, payload) {
  const defaultMsg = `data: ${JSON.stringify({ ...payload, event: eventType })}\n\n`;
  const namedMsg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(defaultMsg);
      if (eventType && eventType !== "message") {
        client.write(namedMsg);
      }
    } catch {
      clients.delete(client);
    }
  }
}
