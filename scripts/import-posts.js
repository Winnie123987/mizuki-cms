const fs = require('fs');
const path = require('path');
const axios = require('axios');
const matter = require('gray-matter');

// ========== 配置 ==========
const STRAPI_URL = 'http://localhost:1337';
const API_TOKEN = process.env.STRAPI_TOKEN || '';
const POSTS_DIR = 'D:\\Mizuki-9.0\\src\\content\\posts';
// ==========================

if (!API_TOKEN) {
  console.error('错误：请设置环境变量 STRAPI_TOKEN');
  console.error('PowerShell: $env:STRAPI_TOKEN="你的token"; node scripts/import-posts.js');
  process.exit(1);
}

const axiosInstance = axios.create({
  baseURL: STRAPI_URL,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * 从文件路径生成 slug
 * - markdown-tutorial.md -> markdown-tutorial
 * - guide/index.md -> guide
 */
function generateSlug(filePath) {
  const relativePath = path.relative(POSTS_DIR, filePath);
  const withoutExt = relativePath.replace(/\.md$/, '');
  if (withoutExt.endsWith('index') || withoutExt.endsWith('index\\')) {
    return withoutExt.replace(/[\\/]index$/, '').replace(/[\\/]/g, '-');
  }
  return withoutExt.replace(/[\\/]/g, '-');
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return undefined;
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  // 处理字符串日期
  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return String(date);
}

/**
 * 递归获取所有 markdown 文件
 */
function getAllMarkdownFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (item.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 检查文章是否已存在（通过 slug）
 */
async function findPostBySlug(slug) {
  try {
    const response = await axiosInstance.get('/api/posts', {
      params: {
        'filters[slug][$eq]': slug,
      },
    });
    return response.data.data.length > 0 ? response.data.data[0] : null;
  } catch (error) {
    return null;
  }
}

/**
 * 导入单篇文章
 */
async function importPost(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  const slug = generateSlug(filePath);

  // 构建 Strapi 文章数据
  const postData = {
    title: data.title || 'Untitled',
    slug: slug,
    published: formatDate(data.published),
    updated: formatDate(data.updated),
    draft: data.draft === true,
    description: data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    category: data.category || '',
    lang: data.lang || '',
    pinned: data.pinned === true,
    comment: data.comment !== false,
    priority: typeof data.priority === 'number' ? data.priority : undefined,
    author: data.author || '',
    sourceLink: data.sourceLink || '',
    licenseName: data.licenseName || '',
    licenseUrl: data.licenseUrl || '',
    encrypted: data.encrypted === true,
    password: data.password || '',
    passwordHint: data.passwordHint || '',
    alias: data.alias || '',
    permalink: data.permalink || '',
    content: content.trim(),
  };

  // 移除 undefined 字段
  Object.keys(postData).forEach((key) => {
    if (postData[key] === undefined) delete postData[key];
  });

  // 检查是否已存在
  const existing = await findPostBySlug(slug);

  try {
    if (existing) {
      // 更新已有文章
      const response = await axiosInstance.put(`/api/posts/${existing.id}`, {
        data: postData,
      });
      console.log(`  ✓ Updated: ${slug} (ID: ${response.data.data.id})`);
      return response.data.data;
    } else {
      // 创建新文章
      const response = await axiosInstance.post('/api/posts', {
        data: postData,
      });
      console.log(`  ✓ Created: ${slug} (ID: ${response.data.data.id})`);
      return response.data.data;
    }
  } catch (error) {
    console.error(`  ✗ Failed: ${slug}`);
    if (error.response) {
      console.error(`    Status: ${error.response.status}`);
      console.error(`    Data: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`    Error: ${error.message}`);
    }
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('  Strapi 文章批量导入工具');
  console.log('========================================\n');

  if (!fs.existsSync(POSTS_DIR)) {
    console.error(`错误：文章目录不存在: ${POSTS_DIR}`);
    process.exit(1);
  }

  const mdFiles = getAllMarkdownFiles(POSTS_DIR);
  console.log(`找到 ${mdFiles.length} 篇 Markdown 文章\n`);

  let success = 0;
  let failed = 0;

  for (const file of mdFiles) {
    const result = await importPost(file);
    if (result) success++;
    else failed++;
  }

  console.log('\n========================================');
  console.log(`  导入完成：成功 ${success} 篇，失败 ${failed} 篇`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('运行出错：', err);
  process.exit(1);
});
