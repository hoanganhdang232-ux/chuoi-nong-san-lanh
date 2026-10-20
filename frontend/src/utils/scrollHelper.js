/**
 * Tự động lướt (scroll) mượt mà đến phần tử được chỉ định và tạo hiệu ứng highlight nổi bật
 * @param {string|HTMLElement} target - ID phần tử (chuỗi) hoặc tham chiếu HTMLElement
 * @param {Object} options - Các tùy chọn bổ sung
 * @param {string} [options.block="center"] - Vị trí căn chỉnh scroll ('center' | 'start' | 'end' | 'nearest')
 * @param {string} [options.behavior="smooth"] - Kiểu cuộn
 * @param {boolean} [options.highlight=true] - Có bật hiệu ứng viền sáng/nền nhấp nháy không
 * @param {number} [options.delay=120] - Độ trễ mili-giây trước khi bắt đầu cuộn (chờ DOM re-render)
 * @param {number} [options.duration=2800] - Thời gian giữ hiệu ứng highlight
 */
export function scrollToElement(target, options = {}) {
  const {
    block = "center",
    behavior = "smooth",
    highlight = true,
    delay = 120,
    duration = 2800,
  } = options;

  if (typeof window === "undefined" || !target) return;

  setTimeout(() => {
    let el = null;
    if (typeof target === "string") {
      el = document.getElementById(target) || document.querySelector(target);
    } else if (target && target.nodeType === 1) {
      el = target;
    }

    if (!el) return;

    try {
      el.scrollIntoView({ behavior, block });
    } catch {
      // Fallback nếu browser không hỗ trợ options
      el.scrollIntoView();
    }

    if (highlight) {
      el.classList.add("animate-highlight-row");
      setTimeout(() => {
        el.classList.remove("animate-highlight-row");
      }, duration);
    }
  }, delay);
}
