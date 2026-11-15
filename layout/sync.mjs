// Синхронизация header, footer и аналитики на всех страницах сайта
// Шаблоны: layout/header.html, layout/footer.html и layout/analytics.html
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = p => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

export function renderHeader(template, { rootPrefix = "./", active = "", isSolid = false } = {}) {
    let out = template;

    // Класс solid для шапки
    out = out.replace(/{{HEADER_CLASS}}/g, isSolid ? " solid" : "");

    // Активные пункты навигации
    out = out.replace(/{{NAV_ACTIVE_HOME}}/g, active === "home" ? ' class="active"' : "");
    out = out.replace(/{{NAV_ACTIVE_MAP}}/g, active === "map" ? ' class="active" aria-current="page"' : "");
    out = out.replace(/{{NAV_ACTIVE_WARDROBE}}/g, active === "wardrobe" ? ' class="active" aria-current="page"' : "");
    out = out.replace(/{{NAV_ACTIVE_RGB}}/g, active === "rgb" ? ' class="active" aria-current="page"' : "");
    out = out.replace(/{{NAV_ACTIVE_WIKI}}/g, active === "wiki" ? ' class="active" aria-current="page"' : "");

    // Подстановка путей
    if (!rootPrefix || rootPrefix === "./") {
        out = out.replace(/{{ROOT}}#/g, "#");
        out = out.replace(/{{ROOT}}assets\//g, "assets/");
        out = out.replace(/{{ROOT}}map\//g, "map/");
        out = out.replace(/{{ROOT}}wardrobe\//g, "wardrobe/");
        out = out.replace(/{{ROOT}}rgb\//g, "rgb/");
        out = out.replace(/{{ROOT}}wiki\//g, "wiki/");
        out = out.replace(/{{ROOT}}/g, "./");
    } else {
        out = out.replace(/{{ROOT}}/g, rootPrefix);
        if (active === "map") {
            out = out.replace(new RegExp(`href="${rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}map\\/"`, "g"), 'href="./"');
        } else if (active === "wardrobe") {
            out = out.replace(new RegExp(`href="${rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}wardrobe\\/"`, "g"), 'href="./"');
        } else if (active === "rgb") {
            out = out.replace(new RegExp(`href="${rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}rgb\\/"`, "g"), 'href="./"');
        }
    }

    return out;
}

export function renderFooter(template, { rootPrefix = "./" } = {}) {
    let out = template;

    if (!rootPrefix || rootPrefix === "./") {
        out = out.replace(/{{ROOT}}#/g, "#");
        out = out.replace(/{{ROOT}}assets\//g, "assets/");
        out = out.replace(/{{ROOT}}map\//g, "map/");
        out = out.replace(/{{ROOT}}wardrobe\//g, "wardrobe/");
        out = out.replace(/{{ROOT}}rgb\//g, "rgb/");
        out = out.replace(/{{ROOT}}wiki\//g, "wiki/");
        out = out.replace(/{{ROOT}}/g, "./");
    } else {
        out = out.replace(/{{ROOT}}/g, rootPrefix);
    }

    return out;
}

export function replaceSection(html, marker, newContent) {
    const startTag = `<!-- LAYOUT:${marker} -->`;
    const endTag = `<!-- /LAYOUT:${marker} -->`;
    const startIdx = html.indexOf(startTag);
    const endIdx = html.indexOf(endTag);
    if (startIdx === -1 || endIdx === -1) {
        throw new Error(`Маркеры ${startTag} ... ${endTag} не найдены!`);
    }
    return (
        html.slice(0, startIdx + startTag.length) +
        "\n\n\n        " +
        newContent.trim() +
        "\n\n\n        " +
        html.slice(endIdx)
    );
}

export function syncAnalytics(html, analyticsTpl) {
    const startTag = "<!-- LAYOUT:ANALYTICS -->";
    const endTag = "<!-- /LAYOUT:ANALYTICS -->";
    const startIdx = html.indexOf(startTag);
    const endIdx = html.indexOf(endTag);
    if (startIdx !== -1 && endIdx !== -1) {
        return (
            html.slice(0, startIdx + startTag.length) +
            "\n        " +
            analyticsTpl.trim() +
            "\n        " +
            html.slice(endIdx)
        );
    }

    // Если маркеров ещё нет, но есть старый блок аналитики — заменяем его на маркер
    const legacyRegex = /<!--\s*(?:Google tag|Google Analytics|Analytics \(deferred)[^>]*-->[\s\S]*?<noscript>[\s\S]*?110548865[\s\S]*?<\/noscript>/i;
    if (legacyRegex.test(html)) {
        return html.replace(
            legacyRegex,
            `${startTag}\n        ${analyticsTpl.trim()}\n        ${endTag}`
        );
    }

    // Если аналитики нет вообще, вставляем перед </body>
    if (/<\/body>/i.test(html)) {
        return html.replace(
            /<\/body>/i,
            `    ${startTag}\n        ${analyticsTpl.trim()}\n        ${endTag}\n    </body>`
        );
    }

    return html + `\n${startTag}\n${analyticsTpl.trim()}\n${endTag}\n`;
}

export function syncFaqSchema(html) {
    const qsMatch = html.match(/<div class="qs">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/i);
    if (!qsMatch) return html;
    const qsHtml = qsMatch[1];

    const faqs = [];
    const detailsRegex = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
    let m;
    while ((m = detailsRegex.exec(qsHtml)) !== null) {
        const dContent = m[1];
        const sumMatch = dContent.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        const contentMatch = dContent.match(/<div class="faq-content">([\s\S]*?)<\/div>/i);
        if (sumMatch && contentMatch) {
            const q = sumMatch[1].replace(/<[^>]+>/g, "").trim();
            const a = contentMatch[1]
                .replace(/<[^>]+>/g, "")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim();
            faqs.push({
                "@type": "Question",
                name: q,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: a,
                },
            });
        }
    }

    if (faqs.length === 0) return html;

    const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i;
    const jsonLdMatch = html.match(jsonLdRegex);
    if (!jsonLdMatch) return html;

    try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld["@graph"] && Array.isArray(ld["@graph"])) {
            const faqIndex = ld["@graph"].findIndex(item => item["@type"] === "FAQPage");
            const newFaqObj = {
                "@type": "FAQPage",
                "@id": "https://astrums.pro/#faq",
                mainEntity: faqs,
            };
            if (faqIndex !== -1) {
                ld["@graph"][faqIndex] = newFaqObj;
            } else {
                ld["@graph"].push(newFaqObj);
            }
            const newJsonStr = JSON.stringify(ld);
            return html.replace(jsonLdRegex, `<script type="application/ld+json">${newJsonStr}</script>`);
        }
    } catch (e) {
        console.error("Ошибка автосинхронизации FAQ JSON-LD:", e.message);
    }
    return html;
}

export function findHtmlPages(dir, list = []) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === ".claude" ||
                entry.name === "layout" ||
                entry.name === "admin"
            ) {
                continue;
            }
            findHtmlPages(full, list);
        } else if (entry.isFile() && entry.name.endsWith(".html")) {
            if (entry.name === "_template.html") continue;
            if (full.includes(`${sep}admin${sep}`)) continue;
            list.push(full);
        }
    }
    return list;
}

export function syncAllLayouts() {
    const headerTpl = read(join(here, "header.html"));
    const footerTpl = read(join(here, "footer.html"));
    const analyticsPath = join(here, "analytics.html");
    const analyticsTpl = existsSync(analyticsPath) ? read(analyticsPath) : "";

    // 1. Главная страница (index.html)
    const indexPath = join(root, "index.html");
    let indexHtml = read(indexPath);
    const homeHeader = renderHeader(headerTpl, { rootPrefix: "./", active: "home", isSolid: false });
    const homeFooter = renderFooter(footerTpl, { rootPrefix: "./" });
    indexHtml = replaceSection(indexHtml, "HEADER", homeHeader);
    indexHtml = replaceSection(indexHtml, "FOOTER", homeFooter);
    indexHtml = syncFaqSchema(indexHtml);
    if (analyticsTpl) indexHtml = syncAnalytics(indexHtml, analyticsTpl);
    writeFileSync(indexPath, indexHtml);

    // 2. Страница карты (map/index.html)
    const mapPath = join(root, "map/index.html");
    let mapHtml = read(mapPath);
    const mapHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "map", isSolid: true });
    mapHtml = replaceSection(mapHtml, "HEADER", mapHeader);
    if (analyticsTpl) mapHtml = syncAnalytics(mapHtml, analyticsTpl);
    writeFileSync(mapPath, mapHtml);

    // 3. Страница гардероба (wardrobe/index.html)
    const wardrobePath = join(root, "wardrobe/index.html");
    if (existsSync(wardrobePath)) {
        let wardrobeHtml = read(wardrobePath);
        const wardrobeHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "wardrobe", isSolid: true });
        const wardrobeFooter = renderFooter(footerTpl, { rootPrefix: "../" });
        wardrobeHtml = replaceSection(wardrobeHtml, "HEADER", wardrobeHeader);
        wardrobeHtml = replaceSection(wardrobeHtml, "FOOTER", wardrobeFooter);
        if (analyticsTpl) wardrobeHtml = syncAnalytics(wardrobeHtml, analyticsTpl);
        writeFileSync(wardrobePath, wardrobeHtml);
    }

    // 4. Страница RGB генератора (rgb/index.html)
    const rgbPath = join(root, "rgb/index.html");
    if (existsSync(rgbPath)) {
        let rgbHtml = read(rgbPath);
        const rgbHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "rgb", isSolid: true });
        const rgbFooter = renderFooter(footerTpl, { rootPrefix: "../" });
        rgbHtml = replaceSection(rgbHtml, "HEADER", rgbHeader);
        rgbHtml = replaceSection(rgbHtml, "FOOTER", rgbFooter);
        if (analyticsTpl) rgbHtml = syncAnalytics(rgbHtml, analyticsTpl);
        writeFileSync(rgbPath, rgbHtml);
    }

    // 5. Шаблон вики (wiki/_template.html) — чтобы все будущие и текущие статьи вики наследовали единую аналитику
    const wikiTplPath = join(root, "wiki/_template.html");
    if (existsSync(wikiTplPath) && analyticsTpl) {
        let wikiTplHtml = read(wikiTplPath);
        wikiTplHtml = syncAnalytics(wikiTplHtml, analyticsTpl);
        writeFileSync(wikiTplPath, wikiTplHtml);
    }

    // 6. 404 страница (404.html)
    const notFoundPath = join(root, "404.html");
    if (existsSync(notFoundPath) && analyticsTpl) {
        let notFoundHtml = read(notFoundPath);
        notFoundHtml = syncAnalytics(notFoundHtml, analyticsTpl);
        writeFileSync(notFoundPath, notFoundHtml);
    }

    // 7. Автоматический поиск и установка метрик в любые другие страницы (.html)
    if (analyticsTpl) {
        const allPages = findHtmlPages(root);
        const explicitPages = new Set([indexPath, mapPath, wardrobePath, rgbPath, notFoundPath]);
        for (const pagePath of allPages) {
            if (explicitPages.has(pagePath)) continue;
            let pageHtml = read(pagePath);
            const updated = syncAnalytics(pageHtml, analyticsTpl);
            if (updated !== pageHtml) {
                writeFileSync(pagePath, updated);
                console.log(`[Аналитика] Установлена в: ${relative(root, pagePath).replace(/\\/g, "/")}`);
            }
        }
    }

    console.log("Синхронизированы header, footer и аналитика во всех страницах сайта");

    return { headerTpl, footerTpl, analyticsTpl };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    syncAllLayouts();
}
