// File: nettruyen.js (api.js)
// Chứa các hàm fetch dữ liệu và tạo danh sách chương

// ================================================================
// BỘ LỌC ẢNH QUẢNG CÁO
// ================================================================
const adPatterns = [
  /quang-cao/i,       // quảng cáo tiếng Việt
  /quangcao/i,
  /qcao/i,
  /banner/i,          // banner quảng cáo
  /logo/i,            // logo
  /avatar/i,          // avatar
  /popup/i,           // popup
  /advert/i,          // advertisement
  /ads/i,             // ads
  /sponsor/i,         // nhà tài trợ
  /khuyen-mai/i,      // khuyến mãi
  /promo/i,           // promo
  /ad_/i,             // tiền tố ad_
  /adv_/i,            // tiền tố adv_
  /quangcao/i,
  /quang_cao/i,
  /banner_/i,
  /popup_/i,
  /ads_/i,
  /sponsor_/i,
  /nettruyenviet1\.png/i,
  /\/0\.jpg/i,
];

// Hàm kiểm tra ảnh có phải quảng cáo không
function isAdImage(src) {
  if (!src) return true;
  const decodedSrc = decodeURIComponent(src).toLowerCase();
  // Kiểm tra toàn bộ URL
  if (adPatterns.some(pattern => pattern.test(decodedSrc))) {
    return true;
  }
  // Kiểm tra tên file (phần sau dấu / cuối cùng)
  const fileName = decodedSrc.split('/').pop();
  if (adPatterns.some(pattern => pattern.test(fileName))) {
    return true;
  }
  return false;
}

// ================================================================
// HÀM FETCH ẢNH CHƯƠNG
// ================================================================
async function fetchChapterImages(chapterUrl) {
  const proxy_url = "https://proxyimg.alokillgtv.workers.dev/?referer=https://nettruyen.gg&url=";
  const full_url = proxy_url + encodeURIComponent(chapterUrl);
  console.log("Chapter:\n" + full_url);
  try {
    const response = await fetch(full_url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const images = [];
    doc.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
      // Chỉ lấy ảnh có vẻ là ảnh truyện
      if (src && (src.includes('nettruyen') || src.includes('kcgsbok') || src.includes('image'))) {
        // Loại bỏ ảnh quảng cáo
        if (!isAdImage(src)) {
          images.push(proxy_url + encodeURIComponent(src));
        } else {
          console.log('Loại bỏ ảnh quảng cáo:', src);
        }
      }
    });
    
    if (images.length === 0) throw new Error('Không tìm thấy ảnh trong trang');
    console.log(`Tìm thấy ${images.length} ảnh hợp lệ.`);
    return images;
  } catch (error) {
    console.error('Lỗi fetch ảnh chương:', error);
    throw error;
  }
}

// ================================================================
// HÀM XÂY DỰNG DANH SÁCH CHƯƠNG
// ================================================================
function buildChapterList() {
  if (POST_CHAPTER === "true") {
    try {
      const data = JSON.parse(DATA_LIST);
      return data.chapters || [];
    } catch (e) {
      console.error('Lỗi parse DATA_LIST:', e);
      return [];
    }
  } else {
    const chapters = [];
    const max = parseInt(MAX_CHAPTER) || 500;
    for (let j = 1; j <= max; j++) {
      chapters.push({
        url: SLUG_CHAPTER + "chuong-" + j,
        title: "Chương " + j,
        id: j
      });
    }
    return chapters;
  }
}

// ================================================================
// HÀM RENDER DANH SÁCH CHƯƠNG
// ================================================================
function renderChapterList(container, currentChapterId, readStatus, onChapterClick) {
  const chapters = buildChapterList();
  
  container.innerHTML = '';
  chapters.forEach(chap => {
    const div = document.createElement('div');
    const status = readStatus[chap.id] || 'unread';
    let statusIcon = '📄';
    if (status === 'reading') statusIcon = '📖';
    else if (status === 'read') statusIcon = '✅';
    
    div.className = `item ${status} ${chap.id === currentChapterId ? 'active' : ''}`;
    div.innerHTML = `
      <span class="chapter-title">${chap.title}</span>
      <span class="badge">${statusIcon}</span>
    `;
    div.addEventListener('click', () => onChapterClick(chap));
    container.appendChild(div);
  });
}
