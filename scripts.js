(() => {
  const STORAGE_KEY = "vbookreader-text";

  const textContainer = document.getElementById("text-container");
  const fileInput = document.getElementById("file-input");
  const uploadStatus = document.getElementById("upload-status");
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  let lines = [];
  let currentIndex = null;
  let lineHeight = 0;
  let currentRawText = "";
  let scrollAnimationId = null;

  function setStatus(message) {
    uploadStatus.textContent = message || "";
  }

  function computeLineHeight() {
    if (!lines.length) return;
    const sample = lines[0];
    const rect = sample.getBoundingClientRect();
    const computed = window.getComputedStyle(sample).lineHeight;
    const parsed = parseFloat(computed);
    lineHeight = rect.height || parsed || 0;
  }

  function getWrapMetrics() {
    const style = window.getComputedStyle(textContainer);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const availableWidth = textContainer.clientWidth - paddingLeft - paddingRight;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontSize = style.fontSize || "16px";
    const fontFamily = style.fontFamily || "monospace";
    const fontWeight = style.fontWeight || "400";
    ctx.font = `${fontWeight} ${fontSize} ${fontFamily}`;
    const charWidth = ctx.measureText("0").width || availableWidth / 50 || 8;
    const maxChars = Math.max(1, Math.floor(availableWidth / charWidth));
    return { maxChars };
  }

  function wrapLine(line, maxChars) {
    const chunks = [];
    if (line === "") {
      chunks.push("\u00a0");
      return chunks;
    }

    let remaining = line;
    while (remaining.length > maxChars) {
      const slice = remaining.slice(0, maxChars + 1);
      let breakIndex = slice.slice(0, maxChars).lastIndexOf(" ");
      if (breakIndex <= 0) breakIndex = maxChars;
      const chunk = remaining.slice(0, breakIndex);
      chunks.push(chunk || "\u00a0");
      remaining = remaining.slice(breakIndex);
      if (remaining.startsWith(" ")) remaining = remaining.slice(1);
    }

    chunks.push(remaining || "\u00a0");
    return chunks;
  }

  function wrapTextIntoLines(text) {
    const normalized = (text || "").replace(/\r\n/g, "\n");
    const { maxChars } = getWrapMetrics();
    const paragraphs = normalized.split("\n");
    return paragraphs.flatMap((para) => wrapLine(para, maxChars));
  }

  function renderText(text) {
    currentRawText = text || "";
    const segments = wrapTextIntoLines(currentRawText);
    textContainer.innerHTML = "";

    lines = segments.map((segment) => {
      const span = document.createElement("span");
      span.className = "line";
      span.textContent = segment.length ? segment : "\u00a0";
      textContainer.appendChild(span);
      return span;
    });

    currentIndex = null;
    if (!lines.length) {
      textContainer.innerHTML = '<div class="placeholder">Load a text file to start reading.</div>';
      return;
    }

    computeLineHeight();
    textContainer.scrollTop = 0;
  }

  function getTopVisibleLineIndex() {
    if (!lines.length) return 0;
    if (!lineHeight) computeLineHeight();
    const index = Math.floor(textContainer.scrollTop / (lineHeight || 1));
    return Math.min(lines.length - 1, Math.max(0, index));
  }

  function clearHighlight() {
    if (currentIndex !== null && lines[currentIndex]) {
      lines[currentIndex].classList.remove("line--highlight");
    }
    currentIndex = null;
  }

  function smoothScrollTo(targetTop) {
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
    }
    const start = textContainer.scrollTop;
    const change = targetTop - start;
    const duration = 650;
    const startTime = performance.now();

    function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeInOutQuad(progress);
      textContainer.scrollTop = start + change * eased;
      if (progress < 1) {
        scrollAnimationId = requestAnimationFrame(step);
      }
    }

    scrollAnimationId = requestAnimationFrame(step);
  }

  function scrollHighlightIntoPlace(index) {
    const line = lines[index];
    if (!line) return;
    if (!lineHeight) computeLineHeight();
    const targetTop = Math.max(0, line.offsetTop - lineHeight * 2);
    smoothScrollTo(targetTop);
  }

  function setHighlight(index) {
    if (index < 0 || index >= lines.length) return;
    if (currentIndex !== null && lines[currentIndex]) {
      lines[currentIndex].classList.remove("line--highlight");
    }
    currentIndex = index;
    lines[currentIndex].classList.add("line--highlight");
    scrollHighlightIntoPlace(currentIndex);
  }

  function toggleHighlightAtTop() {
    if (!lines.length) return;
    if (currentIndex === null) {
      setHighlight(getTopVisibleLineIndex());
    } else {
      clearHighlight();
    }
  }

  function moveHighlight(delta) {
    if (!lines.length) return;
    if (currentIndex === null) {
      setHighlight(getTopVisibleLineIndex());
      return;
    }
    const nextIndex = Math.min(lines.length - 1, Math.max(0, currentIndex + delta));
    setHighlight(nextIndex);
  }

  function handleFileUpload(event) {
    const [file] = event.target.files || [];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      renderText(text);
      try {
        localStorage.setItem(STORAGE_KEY, text);
        setStatus(`Saved "${file.name}" for next time.`);
      } catch (error) {
        setStatus("Loaded file, but could not save it locally.");
      }
    };
    reader.onerror = () => setStatus("Could not read that file.");
    reader.readAsText(file);
  }

  function loadCachedText() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        renderText(cached);
        setStatus("Loaded your last file from cache.");
      }
    } catch (error) {
      setStatus("Local storage is unavailable.");
    }
  }

  function toggleSidebar(forceOpen) {
    const open = forceOpen !== undefined ? forceOpen : !sidebar.classList.contains("sidebar--open");
    sidebar.classList.toggle("sidebar--open", open);
    overlay.classList.toggle("overlay--visible", open);
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";
    if (isTyping) return;

    if (event.code === "Space") {
      event.preventDefault();
      toggleHighlightAtTop();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    }
  });

  window.addEventListener("resize", () => {
    if (!currentRawText) return;
    const cachedScroll = textContainer.scrollTop;
    renderText(currentRawText);
    textContainer.scrollTop = cachedScroll;
  });

  fileInput.addEventListener("change", handleFileUpload);
  menuToggle.addEventListener("click", () => toggleSidebar());
  overlay.addEventListener("click", () => toggleSidebar(false));

  loadCachedText();
})();
