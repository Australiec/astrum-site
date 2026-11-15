// Синхронизация header и footer на всех страницах сайта
// Шаблоны: layout/header.html и layout/footer.html
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
            // На странице карты ссылка на саму карту — ./
            out = out.replace(new RegExp(`href="${rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}map\\/"`, "g"), 'href="./"');
        } else if (active === "wardrobe") {
            // На странице гардероба ссылка на сам гардероб — ./
            out = out.replace(new RegExp(`href="${rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}wardrobe\\/"`, "g"), 'href="./"');
        } else if (active === "rgb") {
            // На странице RGB ссылка на сам RGB — ./
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

export function syncAllLayouts() {
    const headerTpl = read(join(here, "header.html"));
    const footerTpl = read(join(here, "footer.html"));

    // 1. Главная страница (index.html): header (без solid, активна Главная) + footer
    const indexPath = join(root, "index.html");
    let indexHtml = read(indexPath);
    const homeHeader = renderHeader(headerTpl, { rootPrefix: "./", active: "home", isSolid: false });
    const homeFooter = renderFooter(footerTpl, { rootPrefix: "./" });
    indexHtml = replaceSection(indexHtml, "HEADER", homeHeader);
    indexHtml = replaceSection(indexHtml, "FOOTER", homeFooter);
    writeFileSync(indexPath, indexHtml);

    // 2. Страница карты (map/index.html): header (solid, активна Карта), БЕЗ footer
    const mapPath = join(root, "map/index.html");
    let mapHtml = read(mapPath);
    const mapHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "map", isSolid: true });
    mapHtml = replaceSection(mapHtml, "HEADER", mapHeader);
    writeFileSync(mapPath, mapHtml);

    // 3. Страница гардероба (wardrobe/index.html): header (solid, активен Гардероб) + footer
    const wardrobePath = join(root, "wardrobe/index.html");
    if (existsSync(wardrobePath)) {
        let wardrobeHtml = read(wardrobePath);
        const wardrobeHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "wardrobe", isSolid: true });
        const wardrobeFooter = renderFooter(footerTpl, { rootPrefix: "../" });
        wardrobeHtml = replaceSection(wardrobeHtml, "HEADER", wardrobeHeader);
        wardrobeHtml = replaceSection(wardrobeHtml, "FOOTER", wardrobeFooter);
        writeFileSync(wardrobePath, wardrobeHtml);
    }

    // 4. Страница RGB генератора (rgb/index.html): header (solid, активен RGB) + footer
    const rgbPath = join(root, "rgb/index.html");
    if (existsSync(rgbPath)) {
        let rgbHtml = read(rgbPath);
        const rgbHeader = renderHeader(headerTpl, { rootPrefix: "../", active: "rgb", isSolid: true });
        const rgbFooter = renderFooter(footerTpl, { rootPrefix: "../" });
        rgbHtml = replaceSection(rgbHtml, "HEADER", rgbHeader);
        rgbHtml = replaceSection(rgbHtml, "FOOTER", rgbFooter);
        writeFileSync(rgbPath, rgbHtml);
    }

    console.log("Синхронизированы header и footer в index.html, map/index.html, wardrobe/index.html и rgb/index.html");

    return { headerTpl, footerTpl };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    syncAllLayouts();
}
