/**
 * Pexels 图片搜索服务
 * 为 Stage 04 高保真原型提供真实图片
 */

const PEXELS_API_KEY = 'omwklTEJRj66M1cARVdU0vhXbZhTUldHDIZW6NWEVXVrMPzdQpbGe93C';
const PEXELS_BASE = 'https://api.pexels.com/v1/search';

/**
 * 搜索 Pexels 图片，返回图片 URL 列表
 * @param {string} query - 搜索关键词（英文效果更好）
 * @param {number} perPage - 每页数量（1-80）
 * @returns {Promise<Array<{id:number, src:string, alt:string, photographer:string}>>}
 */
export async function searchPexels(query, perPage = 6) {
  try {
    const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=${perPage}&locale=zh-CN`;
    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!res.ok) {
      console.warn(`Pexels API error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!data.photos || !data.photos.length) return [];

    return data.photos.map(p => ({
      id: p.id,
      src: p.src.medium,        // ~350px 宽，适合原型
      srcLarge: p.src.large,     // ~940px
      srcSmall: p.src.tiny,      // ~280px
      alt: p.alt || '',
      photographer: p.photographer,
      url: p.url,
    }));
  } catch (err) {
    console.warn('Pexels search failed:', err.message);
    return [];
  }
}

/**
 * 为特定产品类型批量搜索相关图片
 * @param {object} product - 产品信息对象
 * @returns {Promise<object>} - 按用途分类的图片集合
 */
export async function searchProductImages(product) {
  const isBookExchange = /二手书|教材|交换|买卖书/.test(product.oneLiner || '');
  const isJobApp = /兼职|岗位|结算|靠谱|雇主/.test(product.oneLiner || '');

  const queries = isBookExchange
    ? {
        hero: 'university students books library',
        items: 'textbooks stack university',
        trust: 'students handshake campus',
        empty: 'empty bookshelf study',
      }
    : isJobApp
    ? {
        hero: 'students working part time campus',
        items: 'young people office internship',
        trust: 'team collaboration handshake',
        empty: 'empty desk workspace',
      }
    : {
        hero: 'mobile app interface modern clean',
        items: 'product items modern minimal',
        trust: 'people trust handshake business',
        empty: 'minimal empty state',
      };

  const results = {};
  for (const [key, query] of Object.entries(queries)) {
    results[key] = await searchPexels(query, 3);
  }

  return results;
}
