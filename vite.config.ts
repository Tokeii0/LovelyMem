import { defineConfig, type IndexHtmlTransformContext } from "vite";
// @ts-expect-error Node.js modules
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
// @ts-expect-error Node.js modules
import { join, dirname, resolve } from 'path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 自定义插件：忽略 Monaco Editor 的 source map 警告
function ignoreMonacoSourceMapPlugin() {
  return {
    name: 'ignore-monaco-sourcemap',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      // 移除 Monaco 相关文件中的 sourceMappingURL 注释
      if (id.includes('monaco') && id.endsWith('.js')) {
        return {
          code: code.replace(/\/\/# sourceMappingURL=.*$/gm, ''),
          map: null
        };
      }
      return null;
    }
  };
}

// 自定义插件：复制src目录到dist
function copySrcPlugin() {
  return {
    name: 'copy-src',
    writeBundle() {
      const srcDir = 'src';
      const distSrcDir = 'dist/src';

      function copyDir(src: string, dest: string) {
        if (!existsSync(dest)) {
          mkdirSync(dest, { recursive: true });
        }

        const entries = readdirSync(src);
        for (const entry of entries) {
          const srcPath = join(src, entry);
          const destPath = join(dest, entry);

          if (statSync(srcPath).isDirectory()) {
            // Monaco 编辑器目录也需要原样复制，供独立分析窗口按需加载。
            copyDir(srcPath, destPath);
          } else {
            // 复制运行时需要的 CSS、HTML、JS 文件，跳过 .ts 源文件
            if (entry.endsWith('.css') || entry.endsWith('.html') || entry.endsWith('.js')) {
              // 对于 rollup 已经处理并输出的 HTML（在 rollupOptions.input 中声明的入口，
              // 例如已迁移为 .ts 入口的页面），不要用源文件覆盖：源 HTML 引用的是 .ts，
              // 直接覆盖会导致生产环境加载未编译的 .ts。保留 rollup 产物（已重写为打包后的 .js）。
              if (entry.endsWith('.html') && existsSync(destPath)) {
                continue;
              }
              const destDir = dirname(destPath);
              if (!existsSync(destDir)) {
                mkdirSync(destDir, { recursive: true });
              }
              copyFileSync(srcPath, destPath);
            }
          }
        }
      }

      if (existsSync(srcDir)) {
        copyDir(srcDir, distSrcDir);
        console.log('✅ src目录已复制到dist/src');
      }
    }
  };
}

// 每个应用入口都加载同一份语言运行时，避免遗漏独立工具窗口；宣传页保持独立静态输出。
function injectI18nPlugin() {
  return {
    name: 'inject-i18n-runtime',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(_html: string, context: IndexHtmlTransformContext) {
        // 宣传页是独立静态站点，不加载应用词典、Tauri 窗口广播和共享编辑器依赖。
        if (context.path === '/showcase.html') {
          return [];
        }

        return [{
          tag: 'script',
          attrs: { type: 'module', src: '/src/i18n/index.ts' },
          injectTo: 'head-pre' as const,
        }];
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => ({

  // 所有 HTML 页面统一放在 pages 目录，构建产物仍输出到项目根目录的 dist。
  root: 'pages',
  publicDir: '../public',
  envDir: '..',

  // pages 下的 ../src/* 在浏览器中会规范化为 /src/*；映射回项目源码目录，
  // 确保开发服务器和生产构建使用同一组 HTML 路径。
  resolve: {
    alias: {
      '/src': resolve('src'),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    // 固定开发端口，需与 src-tauri/tauri.conf.json 的 devUrl 保持一致。
    port: 14222,
    strictPort: true,
    // Ensure the dev server binds to localhost by default. If TAURI_DEV_HOST is set explicitly,
    // use it (for example when developing from another host).
    host: host ?? '127.0.0.1',
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 14222,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // 忽略 Monaco Editor 的 source map 警告
    sourcemapIgnoreList: (sourcePath: string) => {
      return sourcePath.includes('monaco') || sourcePath.includes('min-maps');
    },
  },

  // 禁用 CSS source map 以避免警告
  css: {
    devSourcemap: false,
  },

  // 配置多页面应用
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false, // 禁用source map生成
    minify: 'esbuild', // 显式使用 esbuild 压缩（比 terser 快 20-100x）
    target: 'esnext', // 面向现代浏览器，减少 polyfill
    rollupOptions: {
      input: {
        main: resolve('pages/index.html'),
        csv_viewer: resolve('pages/csv_viewer.html'),
        text_viewer: resolve('pages/text_viewer.html'),
        memory_file_browser: resolve('pages/memory-file-browser.html'),
        file_manager: resolve('pages/file_manager.html'),
        string_search: resolve('pages/string-search.html'),
        image_finder: resolve('pages/image-finder.html'),
        stegsolve_analyzer: resolve('pages/stegsolve-analyzer.html'),
        bit_plane_overview: resolve('pages/bit-plane-overview.html'),
        exif_viewer: resolve('pages/exif-viewer.html'),
        theme_editor: resolve('pages/theme_editor.html'),
        super_timeline: resolve('pages/super-timeline.html'),
        symbol_manager: resolve('pages/symbol-manager.html'),
        ai_assistant: resolve('pages/ai_assistant.html'),
        memory_image_visualizer: resolve('pages/memory-image-visualizer.html'),
        sqlite_viewer: resolve('pages/sqlite-viewer.html'),
        hex_viewer: resolve('pages/hex-viewer.html'),
        ioc_extractor: resolve('pages/ioc-extractor.html'),
        registry_forensics: resolve('pages/registry-forensics.html'),
        showcase: resolve('pages/showcase.html'),
      },
      output: {
        manualChunks(id: string) {
          // Tauri API 独立 chunk
          if (id.includes('@tauri-apps')) {
            return 'vendor-tauri';
          }
          // Lucide 独立 chunk
          if (id.includes('lucide')) {
            return 'vendor-lucide';
          }
          // xterm 终端相关
          if (id.includes('@xterm')) {
            return 'vendor-xterm';
          }
          // idb (IndexedDB)
          if (id.includes('/idb/')) {
            return 'vendor-idb';
          }
          // Monaco Editor 独立 chunk（按需加载，避免阻塞首屏）
          if (id.includes('monaco-editor')) {
            return 'vendor-monaco';
          }
        },
      },
      onwarn(warning: any, warn: any) {
        // 忽略source map相关警告
        if (warning.code === 'SOURCEMAP_ERROR') return;
        if (warning.message && warning.message.includes('source map')) return;
        warn(warning);
      },
    },
  },

  // 使用自定义插件
  plugins: [injectI18nPlugin(), ignoreMonacoSourceMapPlugin(), copySrcPlugin()],
}));
