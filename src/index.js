import { readFile, writeFile, access, readdir, unlink, rmdir } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

/**
 * Default configuration
 */
const defaultConfig = {
  site_url: '',
  name: '',
  description: '',
  generate_individual_md: true,
  generate_llms_txt: true,
  generate_llms_full_txt: true,
  title_selector: 'h1',
  content_selector: 'main',
  exclude: ['404', '404.html', '_astro', '**.xml', '**.txt', 'node_modules'],
  verbose: false,
};

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and merge configuration from llms.json if it exists
 */
async function loadUserConfig(rootDir) {
  const configPath = join(rootDir, 'llms.json');
  
  if (await fileExists(configPath)) {
    try {
      const content = await readFile(configPath, 'utf8');
      const userConfig = JSON.parse(content);
      return { ...defaultConfig, ...userConfig };
    } catch (error) {
      console.warn(`⚠️  Warning: Could not parse llms.json: ${error.message}`);
      return defaultConfig;
    }
  }
  
  return defaultConfig;
}

/**
 * Create default llms.json config file
 */
async function createDefaultConfig(rootDir, siteUrl = '') {
  const configPath = join(rootDir, 'llms.json');
  
  if (await fileExists(configPath)) {
    return;
  }
  
  const defaultConfigContent = {
    site_url: siteUrl,
    name: '',
    description: '',
    generate_individual_md: true,
    generate_llms_txt: true,
    generate_llms_full_txt: true,
    title_selector: 'h1',
    content_selector: 'main',
    exclude: ['404', '404.html', '_astro', '**.xml', '**.txt', 'node_modules'],
    verbose: false,
  };
  
  try {
    await writeFile(
      configPath,
      JSON.stringify(defaultConfigContent, null, 2),
      'utf8'
    );
    console.log(`✅ Created llms.json config file`);
  } catch (error) {
    console.warn(`⚠️  Warning: Could not create llms.json: ${error.message}`);
  }
}

/**
 * Discover HTML files in a directory
 */
async function discoverHtmlFiles(inputDir, excludePatterns) {
  const pattern = `${inputDir}/**/*.html`;
  const files = await glob(pattern, {
    ignore: excludePatterns.map(p => `${inputDir}/${p}`),
    absolute: true,
  });
  return files.sort();
}

/**
 * Convert file path to URL path
 */
function fileToUrlPath(filePath, inputDir) {
  const relativePath = filePath.replace(resolve(inputDir), '');
  let urlPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  
  // Remove .html extension
  urlPath = urlPath.replace(/\.html$/, '');
  
  // Handle index files
  if (urlPath.endsWith('/index') || urlPath === 'index') {
    urlPath = urlPath.replace(/\/index$/, '').replace(/^index$/, '');
  }
  
  return '/' + urlPath;
}

/**
 * Process a single HTML file
 */
async function processHtmlFile(filePath, options) {
  const { titleSelector, contentSelector } = options;
  
  const html = await readFile(filePath, 'utf8');
  const root = parse(html);
  
  // Extract title
  const titleElement = root.querySelector(titleSelector);
  const title = titleElement?.text?.trim() || '';
  
  // Extract description from meta tag
  const metaDescription = root.querySelector('meta[name="description"]');
  const description = metaDescription?.getAttribute('content') || '';
  
  // Extract content
  const contentElement = root.querySelector(contentSelector);
  let content = '';
  
  if (contentElement) {
    // Remove script and style tags
    contentElement.querySelectorAll('script, style').forEach(el => el.remove());
    
    // Convert HTML to markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    
    content = turndownService.turndown(contentElement.innerHTML);
  }
  
  return {
    title,
    description,
    content,
  };
}

/**
 * Generate markdown file content for a page
 */
function generateMarkdownFile(page, config) {
  const { siteUrl } = config;
  const url = `${siteUrl}${page.urlPath}`.replace(/\/$/, '');
  
  let md = '---\n';
  md += `title: "${page.title}"\n`;
  md += `url: "${url}"\n`;
  if (page.description) {
    md += `description: "${page.description}"\n`;
  }
  md += '---\n\n';
  md += page.content;
  
  return md;
}

/**
 * Generate llms.txt content
 */
function generateLlmsTxtContent(pages, config) {
  const { name, description, siteUrl } = config;
  
  let content = `# ${name}\n\n`;
  
  if (description) {
    content += `> ${description}\n\n`;
  }
  
  content += 'This file helps language models discover the most useful content on this site.\n\n';
  
  // Group pages by directory
  const grouped = {};
  pages.forEach(page => {
    const parts = page.urlPath.split('/').filter(Boolean);
    const group = parts.length > 1 ? parts[0] : 'Home';
    
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(page);
  });
  
  // Generate sections
  Object.keys(grouped).sort().forEach(group => {
    const groupName = group.charAt(0).toUpperCase() + group.slice(1);
    content += `## ${groupName}\n\n`;
    
    grouped[group].forEach(page => {
      const mdUrl = `${siteUrl}${page.urlPath}.md`.replace(/\/\//g, '/').replace(':/', '://');
      const linkText = page.title || page.urlPath;
      
      if (page.description) {
        content += `- [${linkText}](${mdUrl}): ${page.description}\n`;
      } else {
        content += `- [${linkText}](${mdUrl})\n`;
      }
    });
    
    content += '\n';
  });
  
  return content;
}

/**
 * Generate llms-full.txt content
 */
function generateLlmsFullTxtContent(pages, config) {
  const { name, siteUrl } = config;
  
  let content = `# ${name}\n\n`;
  content += `URL: ${siteUrl}\n\n`;
  
  pages.forEach((page, index) => {
    const url = `${siteUrl}${page.urlPath}`.replace(/\/$/, '');
    content += `## ${page.title}\n\n`;
    content += `URL: ${url}\n\n`;
    
    if (page.description) {
      content += `${page.description}\n\n`;
    }
    
    content += page.content;
    
    if (index < pages.length - 1) {
      content += '\n\n---\n\n';
    }
  });
  
  return content;
}

/**
 * Main function to generate all LLMS files
 */
export async function generateLlmsFiles(config) {
  const {
    inputDir,
    outputDir,
    siteUrl,
    name,
    description,
    generateIndividualMd,
    generateLlmsTxt,
    generateLlmsFullTxt,
    titleSelector,
    contentSelector,
    exclude,
    verbose,
  } = config;

  const resolvedInputDir = resolve(inputDir);
  const resolvedOutputDir = resolve(outputDir);

  // Ensure output directory exists
  try {
    await access(resolvedOutputDir);
  } catch {
    throw new Error(`Output directory does not exist: ${outputDir}`);
  }

  if (verbose) {
    console.log('🔍 Discovering HTML files...');
  }
  
  const htmlFiles = await discoverHtmlFiles(resolvedInputDir, exclude);
  
  if (verbose) {
    console.log(`   Found ${htmlFiles.length} HTML files`);
  }

  // Process all HTML files
  const pages = [];
  for (const file of htmlFiles) {
    try {
      const urlPath = fileToUrlPath(file, resolvedInputDir);
      const pageData = await processHtmlFile(file, {
        titleSelector,
        contentSelector,
      });

      if (!pageData.title) {
        if (verbose) {
          console.log(`   ⚠️  Skipping ${urlPath} (no title found)`);
        }
        continue;
      }

      pages.push({
        urlPath,
        filePath: file,
        ...pageData,
      });

      if (verbose) {
        console.log(`   ✓ ${urlPath}: "${pageData.title}"`);
      }
    } catch (error) {
      console.error(`   ✗ Error processing ${file}: ${error.message}`);
    }
  }

  if (verbose) {
    console.log(`   Processed ${pages.length} pages successfully\n`);
  }

  // Infer site name and description from homepage
  const homePage = pages.find(p => p.urlPath === '/');
  const siteName = name || homePage?.title || 'Site';
  const siteDescription = description || homePage?.description || '';

  const formatterConfig = {
    name: siteName,
    description: siteDescription,
    siteUrl: siteUrl.replace(/\/$/, ''),
  };

  // Generate individual .md files
  if (generateIndividualMd) {
    if (verbose) {
      console.log('📝 Generating individual .md files...');
    }
    
    for (const page of pages) {
      const mdPath = join(
        resolvedOutputDir,
        page.urlPath.replace(/^\//, '') + '.md'
      );
      
      const mdContent = generateMarkdownFile(page, formatterConfig);
      
      // Ensure directory exists
      const mdDir = dirname(mdPath);
      try {
        await access(mdDir);
      } catch {
        await mkdir(mdDir, { recursive: true });
      }
      
      await writeFile(mdPath, mdContent, 'utf8');
      
      if (verbose) {
        console.log(`   ✓ ${mdPath}`);
      }
    }
    
    if (verbose) {
      console.log(`   Created ${pages.length} .md files\n`);
    }
  }

  // Generate llms.txt
  if (generateLlmsTxt) {
    if (verbose) {
      console.log('📋 Generating llms.txt...');
    }
    
    const llmsTxtContent = generateLlmsTxtContent(pages, formatterConfig);
    const llmsTxtPath = join(resolvedOutputDir, 'llms.txt');
    
    await writeFile(llmsTxtPath, llmsTxtContent, 'utf8');
    
    if (verbose) {
      console.log(`   ✓ ${llmsTxtPath}\n`);
    }
  }

  // Generate llms-full.txt
  if (generateLlmsFullTxt) {
    if (verbose) {
      console.log('📚 Generating llms-full.txt...');
    }
    
    const llmsFullContent = generateLlmsFullTxtContent(pages, formatterConfig);
    const llmsFullPath = join(resolvedOutputDir, 'llms-full.txt');
    
    await writeFile(llmsFullPath, llmsFullContent, 'utf8');
    
    if (verbose) {
      console.log(`   ✓ ${llmsFullPath}\n`);
    }
  }

  console.log('✅ Done!');
  console.log('');
  console.log('Summary:');
  console.log(`  - Pages processed: ${pages.length}`);
  if (generateIndividualMd) console.log(`  - .md files created: ${pages.length}`);
  if (generateLlmsTxt) console.log(`  - llms.txt: ${outputDir}/llms.txt`);
  if (generateLlmsFullTxt) console.log(`  - llms-full.txt: ${outputDir}/llms-full.txt`);
}

// Import mkdir for directory creation
import { mkdir } from 'fs/promises';

/**
 * Astro integration for generating llms.txt and markdown files
 * @param {Object} options - Integration options
 * @returns {import('astro').AstroIntegration}
 */
export default function llmsIntegration(options = {}) {
  return {
    name: 'astro-llms-md',
    hooks: {
      'astro:config:setup': async ({ config, command, logger }) => {
        logger.info('Setting up astro-llms-md integration...');
        
        const astroSiteUrl = config.site || '';
        const rootDir = fileURLToPath(config.root);
        
        if (options.autoCreateConfig !== false && command === 'dev') {
          await createDefaultConfig(rootDir, astroSiteUrl);
        }
      },
      
      'astro:build:done': async ({ dir, pages, logger }) => {
        logger.info('Generating llms.txt and markdown files...');
        
        try {
          const distDir = fileURLToPath(dir);
          const rootDir = resolve(distDir, '..');
          
          const userConfig = await loadUserConfig(rootDir);
          
          const finalConfig = {
            inputDir: distDir,
            outputDir: distDir,
            siteUrl: options.siteUrl || userConfig.site_url || '',
            name: options.name || userConfig.name || '',
            description: options.description || userConfig.description || '',
            generateIndividualMd: options.generateIndividualMd ?? userConfig.generate_individual_md ?? true,
            generateLlmsTxt: options.generateLlmsTxt ?? userConfig.generate_llms_txt ?? true,
            generateLlmsFullTxt: options.generateLlmsFullTxt ?? userConfig.generate_llms_full_txt ?? true,
            titleSelector: options.titleSelector || userConfig.title_selector || 'h1',
            contentSelector: options.contentSelector || userConfig.content_selector || 'main',
            exclude: options.exclude || userConfig.exclude || ['404', '404.html', '_astro', '**.xml', '**.txt', 'node_modules'],
            verbose: options.verbose ?? userConfig.verbose ?? false,
          };
          
          if (!finalConfig.siteUrl) {
            logger.warn('No site_url specified in llms.json or integration options');
            logger.warn('Skipping llms.txt generation. Please add site_url to llms.json');
            return;
          }
          
          await generateLlmsFiles(finalConfig);
          
          logger.info('✅ astro-llms-md: Generation complete!');
          
        } catch (error) {
          logger.error(`❌ astro-llms-md: ${error.message}`);
          if (options.verbose) {
            logger.error(error.stack);
          }
        }
      },
    },
  };
}
