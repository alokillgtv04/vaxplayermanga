// File: js/app.js
// Toàn bộ logic giao diện và đọc truyện, dữ liệu từ window.DATA_LIST hoặc tự sinh từ SLUG_CHAPTER

// ================================================================
// TRẠNG THÁI
// ================================================================
let comicData = null;
let current_chapter_id = null;
let current_mode = 'webtoon';
let auto_enabled = false;
let auto_scroll_id = null;
let auto_timer = null;
let auto_type = 'scroll';
let current_page_index = 0;
let is_paused = false;
let speed_scroll = 5;
let speed_page = 5;
let toolbar_open = false;
let brightness = 100;
let bookmarks = [];
let ui_hide_timeout = null;
let panel_hide_timeout = null;
let readStatus = {};
let swipe_back_count = 0;
let swipe_back_timer = null;
let loadingToast = null;

// Cache: Map<chapterId, { container, images, pageCount, title, url }>
const chapterCache = new Map();
const MAX_CACHE_CHAPTERS = 5;
const CACHE_STORAGE_KEY = 'reader_cache_'; // sẽ thêm comic_id sau

// DOM refs
const viewport = document.getElementById('viewport');
const progress_fill = document.getElementById('progressFill');
const toolbar = document.getElementById('toolbar');
const progress_bar = document.getElementById('progressBar');
const main_toggle = document.getElementById('mainToggle');
const radial_menu = document.getElementById('radialMenu');
const comic_title_el = document.getElementById('comicTitle');
const back_button = document.getElementById('backButton');
const radial_auto_toggle = document.getElementById('radialAutoToggle');
const auto_menu_icon = document.getElementById('autoMenuIcon');
const auto_menu_label = document.getElementById('autoMenuLabel');
const radial_bright_up = document.getElementById('radialBrightUp');
const radial_bright_down = document.getElementById('radialBrightDown');
const radial_bookmark = document.getElementById('radialBookmark');
const radial_show_bookmarks = document.getElementById('radialShowBookmarks');
const radial_chapter_list = document.getElementById('radialChapterList');
const radial_mode_toggle = document.getElementById('radialModeToggle');
const mode_icon = document.getElementById('modeIcon');
const mode_label = document.getElementById('modeLabel');
const nav_left = document.getElementById('navLeft');
const nav_right = document.getElementById('navRight');
const toast_container = document.getElementById('toastContainer');

// Auto controls refs
const auto_controls = document.getElementById('autoControls');
const auto_toggle_btn = document.getElementById('autoToggleBtn');
const auto_status = document.getElementById('autoStatus');
const scroll_speed_row = document.getElementById('scrollSpeedRow');
const page_speed_row = document.getElementById('pageSpeedRow');
const speed_scroll_display = document.getElementById('speedScrollDisplay');
const speed_scroll_dec = document.getElementById('speedScrollDec');
const speed_scroll_inc = document.getElementById('speedScrollInc');
const speed_page_display = document.getElementById('speedPageDisplay');
const speed_page_dec = document.getElementById('speedPageDec');
const speed_page_inc = document.getElementById('speedPageInc');

// Panel refs
const chapter_panel = document.getElementById('chapterPanel');
const chapter_panel_list = document.getElementById('chapterPanelList');
const close_chapter_panel = document.getElementById('closeChapterPanel');
const jump_input = document.getElementById('jumpInput');
const jump_btn = document.getElementById('jumpBtn');
const bookmark_panel = document.getElementById('bookmarkPanel');
const bookmark_panel_list = document.getElementById('bookmarkPanelList');
const close_bookmark_panel = document.getElementById('closeBookmarkPanel');

// ================================================================
// KHỞI TẠO DỮ LIỆU
// ================================================================
function get_storage_key() { return `reader_${comicData.comic_id}`; }
function get_cache_storage_key() { return CACHE_STORAGE_KEY + comicData.comic_id; }

function load_settings() {
  try {
    const raw = localStorage.getItem(get_storage_key());
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function save_settings() {
  const data = {
    mode: current_mode,
    brightness: brightness,
    speedScroll: speed_scroll,
    speedPage: speed_page,
    autoEnabled: auto_enabled,
    chapterId: current_chapter_id,
    pageIndex: current_page_index,
    scrollPercent: get_scroll_percent(),
    bookmarks: bookmarks,
    readStatus: readStatus
  };
  localStorage.setItem(get_storage_key(), JSON.stringify(data));
  save_chapter_cache_to_storage();
}

function apply_settings(settings) {
  if (!settings) return;
  if (settings.mode) { current_mode = settings.mode; update_mode_ui(); }
  if (settings.brightness) { brightness = settings.brightness; set_brightness(brightness); }
  if (settings.speedScroll) { speed_scroll = settings.speedScroll; update_speed_ui(); }
  if (settings.speedPage) { speed_page = settings.speedPage; update_speed_ui(); }
  if (settings.bookmarks) { bookmarks = settings.bookmarks; }
  if (settings.readStatus) { readStatus = settings.readStatus; }
}

// ================================================================
// TOAST
// ================================================================
function show_toast(message, type = 'info', duration = 3000, callback = null) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast_container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => {
      toast.remove();
      if (callback) callback();
    }, 300);
  }, duration);
}

function show_confirm_toast(message, onConfirm, onCancel = null) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-info';
  toast.innerHTML = `
    <span>${message}</span>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button id="toastConfirmYes" style="background:#bb86fc; color:#121212; padding:4px 12px; border-radius:4px;">Có</button>
      <button id="toastConfirmNo" style="background:#555; color:#fff; padding:4px 12px; border-radius:4px;">Không</button>
    </div>
  `;
  toast_container.appendChild(toast);
  
  toast.querySelector('#toastConfirmYes').addEventListener('click', () => {
    toast.remove();
    try { onConfirm(); } catch (e) { console.error(e); }
  });
  toast.querySelector('#toastConfirmNo').addEventListener('click', () => {
    toast.remove();
    if (onCancel) {
      try { onCancel(); } catch (e) { console.error(e); }
    }
  });
  
  setTimeout(() => toast.remove(), 10000);
}

function show_loading_toast(message) {
  hide_loading_toast();
  const toast = document.createElement('div');
  toast.className = 'toast toast-info loading-toast';
  toast.innerHTML = `<span class="spinner"></span> ${message}`;
  toast_container.appendChild(toast);
  loadingToast = toast;
}

function hide_loading_toast() {
  if (loadingToast) {
    loadingToast.remove();
    loadingToast = null;
  }
}

// Toast giữa màn hình với các nút
function show_center_toast(message, buttons) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 3000;
    display: flex; align-items: center; justify-content: center;
  `;
  const box = document.createElement('div');
  box.style.cssText = `
    background: #1e1e1e; border: 1px solid #444; border-radius: 12px;
    padding: 20px; max-width: 90vw; color: #e0e0e0;
    display: flex; flex-direction: column; gap: 16px;
  `;
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.fontSize = '1rem';
  box.appendChild(msg);
  
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.gap = '8px';
  btnContainer.style.flexWrap = 'wrap';
  buttons.forEach(btn => {
    const b = document.createElement('button');
    b.textContent = btn.text;
    b.style.padding = '8px 16px';
    b.style.borderRadius = '6px';
    b.style.border = '1px solid #555';
    b.style.background = '#2a2a2a';
    b.style.color = '#fff';
    b.style.cursor = 'pointer';
    b.addEventListener('click', () => {
      overlay.remove();
      btn.onClick();
    });
    btnContainer.appendChild(b);
  });
  box.appendChild(btnContainer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ================================================================
// TOGGLE MENU & AUTO HIDE
// ================================================================
function reset_ui_hide_timer() {
  if (ui_hide_timeout) clearTimeout(ui_hide_timeout);
  ui_hide_timeout = setTimeout(() => {
    if (toolbar_open) toggle_ui();
  }, 10000);
}

function toggle_ui() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  toolbar_open = !toolbar_open;
  toolbar.classList.toggle('open', toolbar_open);
  progress_bar.classList.toggle('open', toolbar_open);
  radial_menu.classList.toggle('open', toolbar_open);
  main_toggle.classList.toggle('open', toolbar_open);
  main_toggle.textContent = toolbar_open ? '✕' : '⚙️';
  
  if (toolbar_open) {
    reset_ui_hide_timer();
  } else {
    if (ui_hide_timeout) clearTimeout(ui_hide_timeout);
  }
}

// ================================================================
// PANEL TỰ ĐỘNG ẨN SAU 30 GIÂY
// ================================================================
function reset_panel_hide_timer() {
  if (panel_hide_timeout) clearTimeout(panel_hide_timeout);
  panel_hide_timeout = setTimeout(() => {
    close_all_panels();
  }, 30000);
}

function close_all_panels() {
  chapter_panel.classList.remove('open');
  bookmark_panel.classList.remove('open');
  if (panel_hide_timeout) clearTimeout(panel_hide_timeout);
  panel_hide_timeout = null;
}

// ================================================================
// FULLSCREEN & BACK
// ================================================================
function toggle_fullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  const is_full = !!document.fullscreenElement;
  toolbar.classList.toggle('fullscreen-mode', is_full);
  if (!is_full && !window._exit_fullscreen_by_user) {
    setTimeout(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }, 300);
  }
  window._exit_fullscreen_by_user = false;
});

back_button.addEventListener('click', () => {
  window._exit_fullscreen_by_user = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (window.history.length > 1) window.history.back();
  else window.location.href = 'about:blank';
});

window.history.pushState(null, null, location.href);
window.addEventListener('popstate', () => window.history.pushState(null, null, location.href));

// ================================================================
// BOOKMARK
// ================================================================
function add_bookmark() {
  const chap = comicData.chapters.find(c => c.id === current_chapter_id);
  if (!chap) return;
  let pos = {};
  if (current_mode === 'webtoon') pos.scrollPercent = get_scroll_percent();
  else pos.pageIndex = current_page_index;
  
  const cached = get_cached_chapter(current_chapter_id);
  const images = cached ? cached.images : [];
  
  const label = `📖 ${chap.title} - ${current_mode === 'webtoon' ? `${Math.round(pos.scrollPercent||0)}%` : `trang ${(pos.pageIndex||0)+1}`}`;
  const bm = { id: Date.now(), chapterId: current_chapter_id, ...pos, label, mode: current_mode, url: chap.url, images: images };
  
  // Xóa ảnh của các bookmark cũ để giải phóng bộ nhớ
  bookmarks.forEach(oldBm => {
    if (oldBm.id !== 'last_read') {
      delete oldBm.images;
    }
  });
  
  bookmarks.push(bm);
  save_settings();
  render_bookmark_panel();
  show_toast('✅ Đã lưu bookmark: ' + label, 'success');
}

function delete_bookmark(id) {
  const bm = bookmarks.find(b => b.id === id);
  bookmarks = bookmarks.filter(b => b.id !== id);
  save_settings();
  render_bookmark_panel();
  if (bm) show_toast('🗑️ Đã xóa bookmark: ' + bm.label, 'info');
}

async function go_to_bookmark(bm) {
  close_bookmark_panel_fn();
  if (bm.chapterId !== current_chapter_id) {
    await load_chapter(bm.chapterId, true);
  }
  setTimeout(() => apply_bookmark_position(bm), 100);
}

function apply_bookmark_position(bm) {
  if (bm.mode === 'webtoon' || current_mode === 'webtoon') {
    const total = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTop = ((bm.scrollPercent || 0) / 100) * total;
  } else if (bm.pageIndex !== undefined) {
    show_page(bm.pageIndex);
  }
}

function update_last_read_bookmark() {
  const chap = comicData.chapters.find(c => c.id === current_chapter_id);
  if (!chap) return;
  let pos = {};
  if (current_mode === 'webtoon') pos.scrollPercent = get_scroll_percent();
  else pos.pageIndex = current_page_index;
  const label = `🔖 Đang đọc: ${chap.title} - ${current_mode === 'webtoon' ? `${Math.round(pos.scrollPercent||0)}%` : `trang ${(pos.pageIndex||0)+1}`}`;
  
  const cached = get_cached_chapter(current_chapter_id);
  const images = cached ? cached.images : [];
  
  let lastRead = bookmarks.find(b => b.id === 'last_read');
  if (lastRead) {
    Object.assign(lastRead, { chapterId: current_chapter_id, ...pos, label, mode: current_mode, url: chap.url, images: images });
  } else {
    bookmarks.unshift({ id: 'last_read', chapterId: current_chapter_id, ...pos, label, mode: current_mode, url: chap.url, images: images });
  }
  save_settings();
}

function render_bookmark_panel() {
  bookmark_panel_list.innerHTML = '';
  
  const lastRead = bookmarks.find(b => b.id === 'last_read');
  if (lastRead) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<span>${lastRead.label}</span><span class="badge">📍</span>`;
    div.addEventListener('click', () => go_to_bookmark(lastRead));
    bookmark_panel_list.appendChild(div);
  }
  
  bookmarks.filter(b => b.id !== 'last_read').forEach(bm => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<span>${bm.label}</span><span class="badge">✕</span>`;
    div.querySelector('.badge').addEventListener('click', (e) => { e.stopPropagation(); delete_bookmark(bm.id); });
    div.addEventListener('click', () => go_to_bookmark(bm));
    bookmark_panel_list.appendChild(div);
  });
  
  if (bookmarks.length === 0) {
    bookmark_panel_list.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">Chưa có bookmark nào</div>';
  }
}

// ================================================================
// QUẢN LÝ CACHE CHƯƠNG
// ================================================================
function create_image_element(url, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'img-wrapper';
  wrapper.dataset.index = index;
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  wrapper.appendChild(spinner);
  const img = document.createElement('img');
  img.className = 'page-img';
  img.dataset.index = index;
  img.alt = `trang ${index+1}`;
  img.style.filter = `brightness(${brightness}%)`;
  img.loading = 'lazy';
  img.onerror = function() {
    this.classList.add('error');
    this.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
        <rect width="800" height="1200" fill="#2a2a2a"/>
        <text x="400" y="600" font-family="sans-serif" font-size="40" fill="#666" text-anchor="middle">⚠️ Lỗi tải ảnh</text>
        <text x="400" y="660" font-family="sans-serif" font-size="24" fill="#555" text-anchor="middle">${this.dataset.src}</text>
      </svg>
    `);
    this.classList.add('loaded');
    wrapper.classList.add('loaded');
    spinner.style.display = 'none';
    console.warn(`Ảnh lỗi: ${this.dataset.src}`);
  };
  img.onload = function() {
    this.classList.add('loaded');
    wrapper.classList.add('loaded');
    spinner.style.display = 'none';
    const ratio = this.naturalWidth / this.naturalHeight;
    if (ratio > 1.1) {
        this.classList.add('landscape');
        wrapper.classList.add('landscape-wrapper');
    }
  };
  img.src = url;
  wrapper.appendChild(img);
  return wrapper;
}

function create_chapter_container(chapter, images) {
  const container = document.createElement('div');
  container.className = 'chapter-container';
  container.dataset.chapterId = chapter.id;
  container.style.position = 'relative';
  container.style.display = 'none'; 

  // Header (chỉ hiển thị ở webtoon)
  const header = document.createElement('div');
  header.className = 'chapter-header';
  header.textContent = `📖 ${chapter.title}`;
  header.style.cssText = `
    display: block;
    background: #1a1a1a;
    padding: 15px 20px;
    text-align: center;
    font-weight: bold;
    font-size: 1.2rem;
    border-bottom: 2px solid #333;
    margin-bottom: 10px;
  `;
  container.appendChild(header);

  images.forEach((url, idx) => {
    const wrapper = create_image_element(url, idx);
    container.appendChild(wrapper);
  });

  // Thanh điều hướng nổi absolute
  const nav = document.createElement('div');
  nav.className = 'chapter-nav-absolute';
  nav.style.cssText = `
    position: absolute;
    bottom: 10px;
    left: 10px;
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0,0,0,0.7);
    padding: 4px 8px;
    border-radius: 20px;
    backdrop-filter: blur(3px);
  `;
  const idx = comicData.chapters.findIndex(c => c.id === chapter.id);
  const shortTitle = shortenChapterTitle(chapter.title);
  nav.innerHTML = `
    <span class="chapter-badge" style="color:#fff; font-size:0.8rem; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${shortTitle}</span>
    <button class="prevChapterBtn" ${idx===0?'disabled':''} style="background:#2a2a2a; border:none; color:#fff; padding:4px 8px; border-radius:15px; cursor:pointer;">◀</button>
    <button class="nextChapterBtn" ${idx===comicData.chapters.length-1?'disabled':''} style="background:#2a2a2a; border:none; color:#fff; padding:4px 8px; border-radius:15px; cursor:pointer;">▶</button>
  `;
  nav.querySelector('.prevChapterBtn').addEventListener('click', () => {
    if (idx > 0) { stop_auto(); load_chapter(comicData.chapters[idx-1].id); }
  });
  nav.querySelector('.nextChapterBtn').addEventListener('click', () => {
    if (idx < comicData.chapters.length-1) { stop_auto(); load_chapter(comicData.chapters[idx+1].id); }
  });
  container.appendChild(nav);

  viewport.appendChild(container);
  return container;
}

function get_cached_chapter(chapterId) {
  return chapterCache.get(chapterId);
}

function apply_chapter_visibility() {
  for (let [id, data] of chapterCache.entries()) {
    const container = data.container;
    const header = container.querySelector('.chapter-header');

    if (current_mode === 'webtoon') {
      header.style.display = 'block';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flexWrap = 'nowrap';
    } else {
      header.style.display = 'none';
      if (id === current_chapter_id) {
        container.style.display = 'flex';
        if (current_mode === 'double') {
          container.style.flexDirection = 'row';
          container.style.flexWrap = 'wrap';
        } else {
          container.style.flexDirection = 'column';
          container.style.flexWrap = 'nowrap';
        }
      } else {
        container.style.display = 'none';
      }
    }
  }
}

function cache_chapter(chapterId, container, images, pageCount, title, url) {
  if (chapterCache.has(chapterId)) {
    const old = chapterCache.get(chapterId);
    old.container.remove();
  }
  
  chapterCache.set(chapterId, { container, images, pageCount, title, url });
  
  // Giới hạn cache
  while (chapterCache.size > MAX_CACHE_CHAPTERS) {
    let oldestId = null;
    for (let id of chapterCache.keys()) {
      if (id === current_chapter_id) continue;
      if (oldestId === null || id < oldestId) oldestId = id;
    }
    if (oldestId === null) break;
    const oldContainer = chapterCache.get(oldestId).container;
    oldContainer.remove();
    chapterCache.delete(oldestId);
  }
  
  apply_chapter_visibility();
}

// Lưu metadata cache (không lưu ảnh)
function save_chapter_cache_to_storage() {
  const cacheData = [];
  for (let [id, data] of chapterCache.entries()) {
    cacheData.push({
      chapterId: id,
      title: data.title,
      url: data.url,
      pageCount: data.pageCount
    });
  }
  try {
    localStorage.setItem(get_cache_storage_key(), JSON.stringify(cacheData));
  } catch (e) {
    console.warn('Không thể lưu cache:', e);
  }
}

function load_chapter_cache_metadata() {
  try {
    const raw = localStorage.getItem(get_cache_storage_key());
    if (!raw) return;
    const cacheData = JSON.parse(raw);
    cacheData.forEach(item => {
      console.log(`Cache metadata: chương ${item.chapterId} - ${item.title}`);
    });
  } catch (e) {
    console.warn('Lỗi đọc cache:', e);
  }
}

async function load_chapter(chapter_id, from_restore = false) {
  console.log(`=== load_chapter(${chapter_id}) ===`);
  const chap = comicData.chapters.find(c => c.id === chapter_id);
  if (!chap) {
    console.error(`Không tìm thấy chương id=${chapter_id}`);
    show_toast('❌ Không tìm thấy chương!', 'error');
    return;
  }
  
  // Kiểm tra cache
  const cached = get_cached_chapter(chapter_id);
  if (cached) {
    console.log(`Chương ${chapter_id} đã có trong cache, chuyển đến.`);
    current_chapter_id = chapter_id;
    current_page_index = 0;
    comic_title_el.textContent = '📚 ' + chap.title;
    
    apply_chapter_visibility();
    viewport.scrollTop = cached.container.offsetTop;
    
    update_read_status(chapter_id);
    update_last_read_bookmark();
    update_progress();
    update_navigation_buttons();
    save_settings();
    
    // Tự động tải chương kế tiếp
    maybe_prefetch_next_chapter();
    return;
  }
  
  // Chưa có -> fetch ảnh
  show_loading_toast(`Đang tải chương ${chap.title}...`);
  try {
    const images = await fetchChapterImages(chap.url);
    console.log(`Nhận ${images.length} ảnh cho chương ${chapter_id}`);
    if (!images || images.length === 0) {
      console.warn(`Chương ${chapter_id} không có ảnh.`);
      hide_loading_toast();
      show_toast('❌ Không tìm thấy ảnh cho chương này', 'error');
      return;
    }
    
    const container = create_chapter_container(chap, images);
    cache_chapter(chapter_id, container, images, images.length, chap.title, chap.url);
    
    current_chapter_id = chapter_id;
    current_page_index = 0;
    comic_title_el.textContent = '📚 ' + chap.title;
    
    apply_chapter_visibility();
    viewport.scrollTop = container.offsetTop;
    
    update_read_status(chapter_id);
    update_last_read_bookmark();
    update_progress();
    update_navigation_buttons();
    render_chapter_panel();
    render_bookmark_panel();
    save_settings();
    
    hide_loading_toast();
    show_toast(`✅ Đã tải xong chương ${chap.title}`, 'success');
    
    // Tự động tải chương kế tiếp
    maybe_prefetch_next_chapter();
  } catch (error) {
    console.error(`Lỗi fetch chương ${chapter_id}:`, error);
    hide_loading_toast();
    show_toast(`❌ Lỗi tải chương: ${error.message}`, 'error');
  }
}

let is_prefetching = false;
async function prefetch_next_chapter() {
  if (is_prefetching) return;
  const currentIdx = comicData.chapters.findIndex(c => c.id === current_chapter_id);
  if (currentIdx === -1 || currentIdx + 1 >= comicData.chapters.length) return;
  
  const nextChap = comicData.chapters[currentIdx + 1];
  if (get_cached_chapter(nextChap.id)) {
    console.log(`Chương kế tiếp ${nextChap.id} đã có trong cache.`);
    return;
  }
  
  is_prefetching = true;
  console.log(`Bắt đầu prefetch chương ${nextChap.id}`);
  try {
    const images = await fetchChapterImages(nextChap.url);
    if (images && images.length > 0) {
      const container = create_chapter_container(nextChap, images);
      cache_chapter(nextChap.id, container, images, images.length, nextChap.title, nextChap.url);
      show_toast(`📥 Đã tải trước ${nextChap.title}`, 'info', 2000);
    }
  } catch (error) {
    console.warn(`Lỗi prefetch chương ${nextChap.id}:`, error);
  } finally {
    is_prefetching = false;
  }
}

function maybe_prefetch_next_chapter() {
  const cached = get_cached_chapter(current_chapter_id);
  if (!cached) return;
  const totalPages = cached.pageCount;
  if (totalPages === 0) return;

  let progress = 0;
  if (current_mode === 'webtoon') {
    const container = cached.container;
    const containerHeight = container.offsetHeight;
    const scrolled = viewport.scrollTop - container.offsetTop;
    progress = (scrolled + viewport.clientHeight) / containerHeight;
  } else {
    progress = (current_page_index + 1) / totalPages;
  }

  if (progress >= 0.6) {
    prefetch_next_chapter();
  }
}

// ================================================================
// TRẠNG THÁI ĐỌC
// ================================================================
function update_read_status(chapterId) {
  const idx = comicData.chapters.findIndex(c => c.id === chapterId);
  if (idx === -1) return;
  
  readStatus[chapterId] = 'reading';
  
  for (let i = 0; i < idx; i++) {
    const id = comicData.chapters[i].id;
    if (!readStatus[id]) readStatus[id] = 'read';
  }
}

function get_read_status(chapterId) {
  return readStatus[chapterId] || 'unread';
}

// ================================================================
// TỰ ĐỘNG NHẬN DIỆN CHẾ ĐỘ
// ================================================================
function auto_detect_mode(pages) {
  const first_img = viewport.querySelector('.page-img');
  if (!first_img || !first_img.complete || first_img.naturalWidth === 0) return;
  const ratio = first_img.naturalWidth / first_img.naturalHeight;
  const is_landscape = ratio > 1.1;
  const is_wide = window.innerWidth >= 768;
  let suggested = 'single';
  if (!is_landscape && is_wide && pages.length > 1) suggested = 'double';
  
  const settings = load_settings();
  if (!settings || !settings.mode) {
    if (current_mode === 'webtoon') {
      current_mode = suggested;
      update_mode_ui();
    }
  }
  update_auto_mode_ui();
  update_navigation_buttons();
  apply_scroll_lock();
}

function apply_scroll_lock() {
  viewport.style.overflowY = (current_mode === 'webtoon') ? 'auto' : 'hidden';
}

function apply_mode() {
  viewport.className = `viewport ${current_mode}`;
  apply_chapter_visibility();
  if (current_mode === 'single' || current_mode === 'double') {
    show_page(current_page_index);
  }
  apply_scroll_lock();
  update_progress();
  update_navigation_buttons();
  update_auto_mode_ui();
  if (auto_enabled) {
    stop_auto();
    start_auto();
  }
  update_mode_ui();
  save_settings();
}

function set_mode(mode) {
  if (mode === current_mode) return;
  current_mode = mode;
  apply_mode();
  save_settings();
}

function cycle_mode() {
  const modes = ['webtoon', 'single', 'double'];
  let idx = modes.indexOf(current_mode);
  idx = (idx + 1) % modes.length;
  set_mode(modes[idx]);
}

function update_mode_ui() {
  const icons = { webtoon: '⬇', single: '📄', double: '📑' };
  const labels = { webtoon: 'Webtoon', single: 'Xem Từng Trang', double: 'Xem Trang Đôi' };
  mode_icon.textContent = icons[current_mode] || '⬇';
  mode_label.textContent = labels[current_mode] || 'Webtoon';
}

function get_page_step() {
  return current_mode === 'double' ? 2 : 1;
}

// ================================================================
// HIỂN THỊ TRANG (single/double)
// ================================================================
function show_page(index) {
  const cached = get_cached_chapter(current_chapter_id);
  if (!cached) return;
  const container = cached.container;
  const wrappers = container.querySelectorAll('.img-wrapper');
  const imgs = container.querySelectorAll('.page-img');
  wrappers.forEach(w => w.classList.remove('active'));
  imgs.forEach(i => i.classList.remove('active'));

  if (current_mode === 'single') {
    if (wrappers[index]) wrappers[index].classList.add('active');
    if (imgs[index]) imgs[index].classList.add('active');
    current_page_index = Math.min(index, wrappers.length - 1);
  } else if (current_mode === 'double') {
    if (wrappers[index]) {
      wrappers[index].classList.add('active');
      if (imgs[index]) imgs[index].classList.add('active');
      const is_landscape = imgs[index] && imgs[index].classList.contains('landscape');
      if (!is_landscape && wrappers[index + 1]) {
        wrappers[index + 1].classList.add('active');
        if (imgs[index + 1]) imgs[index + 1].classList.add('active');
      }
    }
    current_page_index = index;
  }
  update_progress();
  update_last_read_bookmark();
  save_settings();
  maybe_prefetch_next_chapter();
}

// ================================================================
// LƯU & KHÔI PHỤC VỊ TRÍ
// ================================================================
function get_scroll_percent() {
  if (current_mode !== 'webtoon') return 0;
  const { scrollTop, scrollHeight, clientHeight } = viewport;
  if (scrollHeight <= clientHeight) return 0;
  return (scrollTop / (scrollHeight - clientHeight)) * 100;
}

function update_progress() {
  const cached = get_cached_chapter(current_chapter_id);
  if (!cached) return;
  let p = 0;
  if (current_mode === 'webtoon') p = get_scroll_percent();
  else p = (current_page_index / (cached.pageCount - 1)) * 100;
  progress_fill.style.width = Math.min(100, p) + '%';
}

// ================================================================
// PANEL CHƯƠNG
// ================================================================
function render_chapter_panel() {
  chapter_panel_list.innerHTML = '';
  comicData.chapters.forEach(chap => {
    const div = document.createElement('div');
    const status = get_read_status(chap.id);
    let statusIcon = '📄';
    if (status === 'reading') statusIcon = '📖';
    else if (status === 'read') statusIcon = '✅';
    div.className = `item ${status} ${chap.id === current_chapter_id ? 'active' : ''}`;
    div.innerHTML = `
      <span class="chapter-title">${chap.title}</span>
      <span class="badge">${statusIcon}</span>
    `;
    div.addEventListener('click', () => {
      console.log(`Click chương id=${chap.id}`);
      if (chap.id !== current_chapter_id) {
        if (chap.id < current_chapter_id) {
          show_confirm_toast(`Chương ${chap.id} nhỏ hơn chương hiện tại. Bạn có muốn tải?`, () => {
            stop_auto();
            load_chapter(chap.id);
            close_chapter_panel_fn();
          });
        } else {
          stop_auto();
          load_chapter(chap.id);
          close_chapter_panel_fn();
        }
      } else {
        // Nếu đang ở chương này, cuộn lên đầu chương
        const cached = get_cached_chapter(current_chapter_id);
        if (cached) {
          viewport.scrollTop = cached.container.offsetTop;
        }
        close_chapter_panel_fn();
      }
    });
    chapter_panel_list.appendChild(div);
  });
  
  // Cuộn panel đến chương hiện tại
  const activeItem = chapter_panel_list.querySelector('.item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function open_chapter_panel() {
  bookmark_panel.classList.remove('open');
  chapter_panel.classList.add('open');
  render_chapter_panel();
  jump_input.focus();
  reset_panel_hide_timer();
}

function close_chapter_panel_fn() {
  chapter_panel.classList.remove('open');
  if (panel_hide_timeout) clearTimeout(panel_hide_timeout);
  panel_hide_timeout = null;
}

function toggle_chapter_panel() {
  if (chapter_panel.classList.contains('open')) {
    close_chapter_panel_fn();
  } else {
    open_chapter_panel();
  }
}

function jump_to_chapter() {
  const val = parseInt(jump_input.value);
  if (isNaN(val) || val < 1) { show_toast('⚠️ Nhập số chương hợp lệ', 'error'); return; }
  const target = comicData.chapters.find(c => c.id === val);
  if (target) {
    if (target.id !== current_chapter_id) {
      if (target.id < current_chapter_id) {
        show_confirm_toast(`Chương ${val} nhỏ hơn chương hiện tại. Bạn có muốn tải?`, () => {
          stop_auto();
          load_chapter(target.id);
          close_chapter_panel_fn();
        });
      } else {
        stop_auto();
        load_chapter(target.id);
        close_chapter_panel_fn();
      }
    } else {
      show_toast(`ℹ️ Bạn đang ở chương ${val}`, 'info');
      close_chapter_panel_fn();
    }
  } else {
    show_toast(`❌ Không tìm thấy chương ${val}`, 'error');
  }
}

// ================================================================
// PANEL BOOKMARK
// ================================================================
function open_bookmark_panel() {
  chapter_panel.classList.remove('open');
  bookmark_panel.classList.add('open');
  render_bookmark_panel();
  reset_panel_hide_timer();
}

function close_bookmark_panel_fn() {
  bookmark_panel.classList.remove('open');
  if (panel_hide_timeout) clearTimeout(panel_hide_timeout);
  panel_hide_timeout = null;
}

function toggle_bookmark_panel() {
  if (bookmark_panel.classList.contains('open')) {
    close_bookmark_panel_fn();
  } else {
    open_bookmark_panel();
  }
}

// ================================================================
// TỰ ĐỘNG CẢI TIẾN TỐC ĐỘ VÀ GIAO DIỆN MỜ
// ================================================================
function update_auto_mode_ui() {
  auto_type = (current_mode === 'webtoon') ? 'scroll' : 'page';
  
  if (auto_enabled) {
    auto_controls.style.display = 'flex';
    auto_status.textContent = is_paused ? 'Dừng' : 'Chạy';
    auto_menu_icon.textContent = '⏹';
    auto_menu_label.textContent = 'Dừng';
    
    if (current_mode === 'webtoon') {
      scroll_speed_row.style.display = 'flex';
      page_speed_row.style.display = 'none';
    } else {
      scroll_speed_row.style.display = 'none';
      page_speed_row.style.display = 'flex';
    }
  } else {
    auto_controls.style.display = 'none';
    auto_menu_icon.textContent = '⏯';
    auto_menu_label.textContent = 'Auto';
  }
}

let last_time = 0;
function start_auto() {
  if (auto_scroll_id) { cancelAnimationFrame(auto_scroll_id); auto_scroll_id = null; }
  if (auto_timer) { clearInterval(auto_timer); auto_timer = null; }
  auto_enabled = true;
  is_paused = false;
  last_time = 0;
  update_auto_mode_ui();
  save_settings();

  if (auto_type === 'scroll') {
    viewport.classList.add('auto-scrolling');
  }

  if (auto_type === 'scroll') {
    function scroll_step(time) {
      if (!auto_enabled || is_paused) {
        auto_scroll_id = null;
        return;
      }
      if (!last_time) last_time = time;
      const delta = Math.min((time - last_time) / 16, 3);
      last_time = time;
      const step = (speed_scroll * 0.6) * delta;
      viewport.scrollTo({ top: viewport.scrollTop + step, behavior: 'auto' });
      if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 10) {
        go_to_next_chapter();
        if (auto_enabled) {
          last_time = 0;
          auto_scroll_id = requestAnimationFrame(scroll_step);
        }
        return;
      }
      update_progress();
      update_last_read_bookmark();
      save_settings();
      maybe_prefetch_next_chapter();
      auto_scroll_id = requestAnimationFrame(scroll_step);
    }
    auto_scroll_id = requestAnimationFrame(scroll_step);
  } else {
    const interval = Math.max(300, 3000 - (speed_page * 30));
    auto_timer = setInterval(() => {
      if (is_paused || !auto_enabled) return;
      const cached = get_cached_chapter(current_chapter_id);
      if (!cached) return;
      const totalPages = cached.pageCount;
      const step = get_page_step();
      if (current_page_index + step < totalPages) {
        show_page(current_page_index + step);
      } else {
        go_to_next_chapter();
      }
    }, interval);
  }
}

function stop_auto() {
  auto_enabled = false;
  if (auto_scroll_id) { cancelAnimationFrame(auto_scroll_id); auto_scroll_id = null; }
  if (auto_timer) { clearInterval(auto_timer); auto_timer = null; }
  is_paused = false;
  viewport.classList.remove('auto-scrolling');
  update_auto_mode_ui();
  save_settings();
}

function toggle_auto() {
  if (auto_enabled) {
    stop_auto();
    show_toast('⏹ Đã tắt tự động', 'info');
  } else {
    start_auto();
    show_toast('▶ Đã bật tự động', 'success');
  }
}

function toggle_pause() {
  if (!auto_enabled) return;
  is_paused = !is_paused;
  update_auto_mode_ui();
  save_settings();
  show_toast(is_paused ? '⏸ Tạm dừng tự động' : '▶ Tiếp tục tự động', 'info');
}

function go_to_next_chapter() {
  console.log('go_to_next_chapter called');
  const idx = comicData.chapters.findIndex(c => c.id === current_chapter_id);
  if (idx < comicData.chapters.length - 1) {
    const next = comicData.chapters[idx + 1];
    console.log(`Đang chuyển đến chương ${next.id} - ${next.title}`);
    load_chapter(next.id);
    show_toast(`⏩ Chuyển sang chương: ${next.title}`, 'info');
  } else {
    stop_auto();
    show_toast('🎉 Hết truyện!', 'success');
  }
}

// ================================================================
// TỐC ĐỘ 
// ================================================================
function update_speed_ui() {
  speed_scroll_display.textContent = speed_scroll;
  speed_page_display.textContent = speed_page;
  save_settings();
}

function restart_auto_if_needed() {
  if (auto_enabled && !is_paused) {
    stop_auto();
    start_auto();
  }
}

// ================================================================
// ĐỘ SÁNG
// ================================================================
function set_brightness(value) {
  brightness = Math.min(200, Math.max(20, value));
  document.querySelectorAll('.page-img').forEach(img => {
    img.style.filter = `brightness(${brightness}%)`;
  });
  save_settings();
}
function change_brightness(delta) {
  set_brightness(brightness + delta);
}

// ================================================================
// NÚT CHUYỂN TRANG
// ================================================================
function update_navigation_buttons() {
  const show = (current_mode !== 'webtoon');
  nav_left.classList.toggle('show', show);
  nav_right.classList.toggle('show', show);
  if (show && !nav_left.classList.contains('guide')) {
    nav_left.classList.add('guide');
    nav_right.classList.add('guide');
    setTimeout(() => {
      nav_left.classList.remove('guide');
      nav_right.classList.remove('guide');
    }, 6000);
  }
}

// Thêm sự kiện click cho mobile: chạm nửa trái/phải màn hình để chuyển trang (chỉ khi không phải webtoon)
viewport.addEventListener('touchend', (e) => {
  if (current_mode === 'webtoon') return;
  const touchX = e.changedTouches[0].clientX;
  const screenWidth = window.innerWidth;
  if (touchX < screenWidth * 0.5) {
    const step = get_page_step();
    if (current_page_index >= step) show_page(current_page_index - step);
    else if (current_page_index > 0) show_page(0);
  } else {
    const cached = get_cached_chapter(current_chapter_id);
    if (!cached) return;
    const totalPages = cached.pageCount;
    const step = get_page_step();
    if (current_page_index + step < totalPages) show_page(current_page_index + step);
    else go_to_next_chapter();
  }
});

nav_left.addEventListener('click', () => {
  if (current_mode === 'webtoon') return;
  const step = get_page_step();
  if (current_page_index >= step) show_page(current_page_index - step);
  else if (current_page_index > 0) show_page(0);
});

nav_right.addEventListener('click', () => {
  if (current_mode === 'webtoon') return;
  const cached = get_cached_chapter(current_chapter_id);
  if (!cached) return;
  const totalPages = cached.pageCount;
  const step = get_page_step();
  if (current_page_index + step < totalPages) show_page(current_page_index + step);
  else go_to_next_chapter();
});

// ================================================================
// PHÍM, VUỐT, DOUBLE TAP
// ================================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (current_mode === 'webtoon') viewport.scrollTop -= 300;
    else {
      const step = get_page_step();
      if (current_page_index >= step) show_page(current_page_index - step);
      else if (current_page_index > 0) show_page(0);
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (current_mode === 'webtoon') viewport.scrollTop += 300;
    else {
      const cached = get_cached_chapter(current_chapter_id);
      if (!cached) return;
      const totalPages = cached.pageCount;
      const step = get_page_step();
      if (current_page_index + step < totalPages) show_page(current_page_index + step);
      else go_to_next_chapter();
    }
  } else if (e.key === ' ') { e.preventDefault(); toggle_auto(); }
  else if (e.key === 'Escape') {
    if (chapter_panel.classList.contains('open')) close_chapter_panel_fn();
    else if (bookmark_panel.classList.contains('open')) close_bookmark_panel_fn();
    else if (toolbar_open) toggle_ui();
  }
});

// Double tap để bật/tắt auto
let last_tap_time = 0;

function handle_double_tap() {
  if (auto_scroll_id || auto_timer) {
    stop_auto();
    show_toast('⏹ Đã tắt tự động', 'info');
  } else {
    start_auto();
    show_toast('▶ Đã bật tự động', 'success');
  }
}

viewport.addEventListener('click', (e) => {
  const now = Date.now();
  if (now - last_tap_time < 500) {
    handle_double_tap();
    last_tap_time = 0;
  } else {
    last_tap_time = now;
  }
});

// Sự kiện scroll cập nhật vị trí đọc
viewport.addEventListener('scroll', () => {
  if (current_mode === 'webtoon') {
    update_last_read_bookmark();
    update_progress();
    maybe_prefetch_next_chapter();
  }
});

// Vuốt mép: mở panel hoặc back 3 lần liên tiếp
let touch_start_x = 0, touch_start_y = 0;
document.addEventListener('touchstart', (e) => {
  touch_start_x = e.changedTouches[0].screenX;
  touch_start_y = e.changedTouches[0].screenY;
});

document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].screenX - touch_start_x;
  const dy = e.changedTouches[0].screenY - touch_start_y;
  if (Math.abs(dx) > 80 && Math.abs(dy) < 100) {
    if (dx > 0 && touch_start_x < 30) {
      swipe_back_count++;
      if (swipe_back_timer) clearTimeout(swipe_back_timer);
      swipe_back_timer = setTimeout(() => { swipe_back_count = 0; }, 3000);
      if (swipe_back_count >= 3) {
        swipe_back_count = 0;
        if (swipe_back_timer) clearTimeout(swipe_back_timer);
        back_button.click();
      } else {
        if (!chapter_panel.classList.contains('open') && !bookmark_panel.classList.contains('open')) {
          open_chapter_panel();
        }
      }
    } else if (dx < 0 && touch_start_x > window.innerWidth - 30) {
      if (!chapter_panel.classList.contains('open') && !bookmark_panel.classList.contains('open')) {
        open_bookmark_panel();
      }
    }
  }
});

// Đóng panel khi click ra ngoài
document.addEventListener('click', (e) => {
  const isChapterPanel = chapter_panel.contains(e.target);
  const isBookmarkPanel = bookmark_panel.contains(e.target);
  const isRadialMenu = radial_menu.contains(e.target);
  const isMainToggle = main_toggle.contains(e.target);
  const isAutoControls = auto_controls.contains(e.target);
  if (!isChapterPanel && !isBookmarkPanel && !isRadialMenu && !isMainToggle && !isAutoControls) {
    if (chapter_panel.classList.contains('open')) close_chapter_panel_fn();
    if (bookmark_panel.classList.contains('open')) close_bookmark_panel_fn();
    if (toolbar_open) toggle_ui();
  }
});

// ================================================================
// XOAY MÀN HÌNH
// ================================================================
function handle_orientation_change() {
  setTimeout(() => {
    const first_img = viewport.querySelector('.page-img');
    if (first_img && first_img.complete && first_img.naturalWidth > 0) {
      const chap = comicData.chapters.find(c => c.id === current_chapter_id);
      if (chap) {
        auto_detect_mode(chap.pages);
        if (current_mode !== 'webtoon') apply_mode();
      }
    }
  }, 300);
}
window.addEventListener('orientationchange', handle_orientation_change);
window.addEventListener('resize', () => {
  handle_orientation_change();
  update_navigation_buttons();
});

// ================================================================
// KHỞI TẠO
// ================================================================
function buildComicData() {
  const chapters = buildChapterList(); // từ nettruyen.js
  let comic_id = window.SLUG_CHAPTER || '';
  let comic_title = window.NAME_CHAPTER || 'Unknown';
  
  if (window.POST_CHAPTER === "true" && window.DATA_LIST) {
    try {
      const data = JSON.parse(window.DATA_LIST);
      comic_id = data.comic_id;
      comic_title = data.comic_title;
    } catch (e) {
      console.error('Lỗi parse DATA_LIST để lấy thông tin:', e);
    }
  }
  
  return {
    comic_id: comic_id,
    comic_title: comic_title,
    chapters: chapters
  };
}

async function init() {
  console.log('=== Khởi tạo app ===');
  comicData = buildComicData();
  if (!comicData || !comicData.chapters || comicData.chapters.length === 0) {
    show_toast('❌ Không có dữ liệu truyện', 'error');
    return;
  }
  console.log(`Có ${comicData.chapters.length} chương.`);
  
  load_chapter_cache_metadata();
  
  const startChapterId = parseInt(window.START_CHAPTER) || comicData.chapters[0].id;
  console.log(`START_CHAPTER = ${startChapterId}`);
  
  document.title = `📖 ${comicData.comic_title}`;
  comic_title_el.textContent = `📚 ${comicData.comic_title}`;
  
  const settings = load_settings();
  if (settings) apply_settings(settings);
  
  setupEventListeners();
  
  let targetChapterId = startChapterId;
  let restorePosition = null;
  
  if (settings && settings.chapterId) {
    const savedChapterId = settings.chapterId;
    if (savedChapterId === startChapterId) {
      targetChapterId = savedChapterId;
      restorePosition = {
        pageIndex: settings.pageIndex || 0,
        scrollPercent: settings.scrollPercent || 0
      };
    } else {
      const savedChap = comicData.chapters.find(c => c.id === savedChapterId);
      const savedPos = settings.pageIndex !== undefined 
        ? `trang ${settings.pageIndex + 1}` 
        : `${Math.round(settings.scrollPercent || 0)}%`;
      
      show_center_toast(
        `Bạn đã xem đến chương ${savedChapterId} - ${savedPos}. Bạn muốn xem tiếp không?`,
        [
          {
            text: 'Xem Chapter Lưu',
            onClick: () => {
              load_chapter(savedChapterId, true).then(() => {
                if (settings.pageIndex !== undefined) show_page(settings.pageIndex);
                else if (settings.scrollPercent !== undefined) {
                  const total = viewport.scrollHeight - viewport.clientHeight;
                  viewport.scrollTop = (settings.scrollPercent / 100) * total;
                }
              });
            }
          },
          {
            text: 'Xem Chapter Kế',
            onClick: () => {
              const nextId = savedChapterId + 1;
              const nextChap = comicData.chapters.find(c => c.id === nextId) || comicData.chapters.find(c => c.id === startChapterId);
              load_chapter(nextChap.id, true);
            }
          },
          {
            text: 'Thôi',
            onClick: () => {
              // Nếu chọn Thôi, load chương theo START_CHAPTER
              load_chapter(startChapterId, true);
            }
          }
        ]
      );
      return;
    }
  } else {
    targetChapterId = startChapterId;
  }
  
  await load_chapter(targetChapterId, true);
  if (restorePosition) {
    if (current_mode === 'webtoon') {
      const total = viewport.scrollHeight - viewport.clientHeight;
      viewport.scrollTop = (restorePosition.scrollPercent / 100) * total;
    } else {
      show_page(restorePosition.pageIndex || 0);
    }
  }
  
  if (settings && settings.autoEnabled) start_auto();
}

function shortenChapterTitle(title) {
  // Tìm phần "Chương X" đầu tiên
  const match = title.match(/^(Chương\s*\d+)/i);
  if (match) {
    return match[0] + '...';
  }
  // Nếu quá dài (hơn 20 ký tự), cắt và thêm ...
  if (title.length > 20) {
    return title.substring(0, 20) + '...';
  }
  return title;
}
function setupEventListeners() {
  main_toggle.addEventListener('click', toggle_ui);
  radial_auto_toggle.addEventListener('click', toggle_auto);
  radial_bright_up.addEventListener('click', () => { change_brightness(10); reset_ui_hide_timer(); });
  radial_bright_down.addEventListener('click', () => { change_brightness(-10); reset_ui_hide_timer(); });
  radial_bookmark.addEventListener('click', () => { add_bookmark(); reset_ui_hide_timer(); });
  radial_show_bookmarks.addEventListener('click', () => { toggle_bookmark_panel(); reset_ui_hide_timer(); });
  radial_chapter_list.addEventListener('click', () => { toggle_chapter_panel(); reset_ui_hide_timer(); });
  radial_mode_toggle.addEventListener('click', () => { cycle_mode(); reset_ui_hide_timer(); });

  auto_toggle_btn.addEventListener('click', stop_auto);
  speed_scroll_dec.addEventListener('click', () => {
    let v = speed_scroll - 1; if (v < 1) v = 1;
    speed_scroll = v; update_speed_ui(); reset_ui_hide_timer();
  });
  speed_scroll_inc.addEventListener('click', () => {
    let v = speed_scroll + 1; if (v > 100) v = 100;
    speed_scroll = v; update_speed_ui(); reset_ui_hide_timer();
  });
  speed_page_dec.addEventListener('click', () => {
    let v = speed_page - 1; if (v < 1) v = 1;
    speed_page = v; update_speed_ui(); restart_auto_if_needed(); reset_ui_hide_timer();
  });
  speed_page_inc.addEventListener('click', () => {
    let v = speed_page + 1; if (v > 100) v = 100;
    speed_page = v; update_speed_ui(); restart_auto_if_needed(); reset_ui_hide_timer();
  });

  close_chapter_panel.addEventListener('click', close_chapter_panel_fn);
  close_bookmark_panel.addEventListener('click', close_bookmark_panel_fn);
  jump_btn.addEventListener('click', jump_to_chapter);
  jump_input.addEventListener('keydown', (e) => { if (e.key === 'Enter') jump_to_chapter(); });
}

// Gọi init khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', init);
