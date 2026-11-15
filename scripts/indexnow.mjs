#!/usr/bin/env node
/**
 * Скрипт отправки страниц в поисковые системы (Bing, Яндекс и др.) по протоколу IndexNow.
 *
 * Использование:
 *   node scripts/indexnow.mjs                        # Отправить изменённые по git файлы
 *   node scripts/indexnow.mjs --all                  # Отправить все страницы из sitemap.xml
 *   node scripts/indexnow.mjs https://astrums.pro/... # Отправить конкретные URL
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 1. Определение адреса сайта
function getSiteUrl() {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
    try {
        const siteJson = JSON.parse(readFileSync(join(root, "site.json"), "utf8"));
        if (siteJson.url) return siteJson.url.replace(/\/$/, "");
    } catch {}
    try {
        const cname = readFileSync(join(root, "CNAME"), "utf8").trim();
        if (cname) return `https://${cname}`.replace(/\/$/, "");
    } catch {}
    return "https://astrums.pro";
}

// 2. Определение ключа IndexNow
function getIndexNowKey() {
    if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
    try {
        const files = readdirSync(root);
        for (const file of files) {
            if (/^[a-f0-9]{16,64}\.txt$/i.test(file)) {
                const content = readFileSync(join(root, file), "utf8").trim();
                const keyName = file.replace(/\.txt$/, "");
                if (content === keyName) {
                    return keyName;
                }
            }
        }
    } catch {}
    return "72d015593571ee0531a068cdfcdd06c5";
}

// 3. Извлечение всех URL из sitemap.xml
function getUrlsFromSitemap(siteUrl) {
    const sitemapPath = join(root, "sitemap.xml");
    if (!existsSync(sitemapPath)) {
        return [`${siteUrl}/`];
    }
    const xml = readFileSync(sitemapPath, "utf8");
    const urls = [];
    const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
        urls.push(match[1].trim());
    }
    return urls.length > 0 ? urls : [`${siteUrl}/`];
}

// 4. Определение изменённых URL через git
function getChangedUrlsFromGit(siteUrl) {
    const urls = new Set();
    let changedFiles = [];

    try {
        const eventBefore = process.env.GITHUB_EVENT_BEFORE;
        const sha = process.env.GITHUB_SHA;

        if (eventBefore && sha && !/^0+$/.test(eventBefore)) {
            const out = execSync(`git diff --name-only ${eventBefore} ${sha}`, { cwd: root, encoding: "utf8" });
            changedFiles = out.split(/\r?\n/).filter(Boolean);
        } else {
            // Локально или в обычном коммите
            const headDiff = execSync("git diff --name-only HEAD~1 HEAD", { cwd: root, encoding: "utf8" });
            const unstaged = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
            const diffFiles = headDiff.split(/\r?\n/).filter(Boolean);
            const unstagedFiles = unstaged
                .split(/\r?\n/)
                .filter(Boolean)
                .map(line => line.slice(3).trim());
            changedFiles = Array.from(new Set([...diffFiles, ...unstagedFiles]));
        }
    } catch {
        // Если git недоступен или это первый коммит
        return getUrlsFromSitemap(siteUrl);
    }

    for (const file of changedFiles) {
        const norm = file.replace(/\\/g, "/");

        if (norm === "index.html") {
            urls.add(`${siteUrl}/`);
        } else if (norm.startsWith("wiki/content/") && norm.endsWith(".md")) {
            const slug = norm.replace(/^wiki\/content\//, "").replace(/\.md$/, "");
            if (slug.startsWith("_")) continue;
            if (slug === "info") {
                urls.add(`${siteUrl}/wiki/`);
            } else {
                urls.add(`${siteUrl}/wiki/${slug}/`);
            }
        } else if (norm.startsWith("map/")) {
            urls.add(`${siteUrl}/map/`);
        } else if (norm.startsWith("wardrobe/")) {
            urls.add(`${siteUrl}/wardrobe/`);
        } else if (norm.startsWith("rgb/")) {
            urls.add(`${siteUrl}/rgb/`);
        } else if (norm.startsWith("wiki/") && norm.endsWith("/index.html")) {
            const rel = norm.replace(/^wiki\//, "").replace(/\/index\.html$/, "");
            urls.add(`${siteUrl}/wiki/${rel}/`);
        } else if (norm === "wiki/index.html") {
            urls.add(`${siteUrl}/wiki/`);
        }
    }

    if (urls.size === 0) {
        // Если менялись только скрипты/ассеты/стили, отправляем ключевые разделы
        urls.add(`${siteUrl}/`);
        urls.add(`${siteUrl}/wiki/`);
    }

    return Array.from(urls);
}

// 5. Отправка в IndexNow
async function submitIndexNow(endpoint, host, key, keyLocation, urlList) {
    const payload = {
        host,
        key,
        keyLocation,
        urlList,
    };

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "IndexNow-AstrumPro/1.0",
            },
            body: JSON.stringify(payload),
        });

        const status = res.status;
        const text = await res.text().catch(() => "");

        if (status === 200) {
            console.log(`  [OK 200] ${endpoint}: URL успешно приняты поисковой системой.`);
            return true;
        } else if (status === 202) {
            console.log(`  [ACCEPTED 202] ${endpoint}: URL приняты, проверка ключа в процессе.`);
            return true;
        } else if (status === 400) {
            console.warn(`  [WARN 400] ${endpoint}: Некорректный запрос (неверный формат). ${text}`);
        } else if (status === 403) {
            console.warn(`  [WARN 403] ${endpoint}: Ключ не подтверждён (файл ключа ${keyLocation} ещё не доступен на сайте).`);
        } else if (status === 422) {
            console.warn(`  [WARN 422] ${endpoint}: Хост не совпадает с URL в urlList.`);
        } else if (status === 429) {
            console.warn(`  [WARN 429] ${endpoint}: Превышен лимит запросов.`);
        } else {
            console.warn(`  [STATUS ${status}] ${endpoint}: ${text}`);
        }
        return false;
    } catch (err) {
        console.error(`  [ERROR] Ошибка запроса к ${endpoint}:`, err.message);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const siteUrl = getSiteUrl();
    const host = new URL(siteUrl).host;
    const key = getIndexNowKey();
    const keyLocation = `${siteUrl}/${key}.txt`;

    let urlsToSend = [];

    const explicitUrls = args.filter(a => a.startsWith("http://") || a.startsWith("https://"));
    const wantsAll = args.includes("--all");

    if (explicitUrls.length > 0) {
        urlsToSend = explicitUrls;
    } else if (wantsAll) {
        urlsToSend = getUrlsFromSitemap(siteUrl);
    } else {
        urlsToSend = getChangedUrlsFromGit(siteUrl);
    }

    // Удаляем дубликаты
    urlsToSend = Array.from(new Set(urlsToSend));

    console.log(`\n=== IndexNow: Отправка URL в поисковые системы ===`);
    console.log(`Хост:         ${host}`);
    console.log(`Ключ:         ${key}`);
    console.log(`Файл ключа:   ${keyLocation}`);
    console.log(`URL к отправке (${urlsToSend.length}):`);
    urlsToSend.forEach(u => console.log(`  - ${u}`));
    console.log("");

    const endpoints = [
        "https://api.indexnow.org/indexnow",
        "https://yandex.com/indexnow",
    ];

    for (const ep of endpoints) {
        await submitIndexNow(ep, host, key, keyLocation, urlsToSend);
    }

    console.log(`\nГотово!\n`);
}

main().catch(err => {
    console.error("Ошибка выполнения IndexNow:", err);
    process.exit(1);
});
