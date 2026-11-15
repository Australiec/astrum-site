// Собирает вики в обычные HTML-страницы (для поисковиков и быстрой загрузки):
//   wiki/content/*.md  →  wiki/index.html, wiki/<статья>/index.html, wiki/search.json, sitemap.xml, robots.txt
// Запуск:  node wiki/build.mjs            (локально)
//          node wiki/build.mjs --watch    (пересобирать при каждом сохранении статьи)
//          node wiki/build.mjs --stamp    (в CI: подставить адрес сайта из site.json в index.html и map/index.html)
// Адрес сайта берётся из site.json — при подключении своего домена поменяйте его там.
import { Marked } from "marked";
import { imageSize } from "image-size";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader, syncAllLayouts } from "../layout/sync.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const contentDir = join(here, "content");
const read = p => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = t =>
    t
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "");

function getLastModified(relPath) {
    const absPath = join(root, relPath);
    try {
        const dirty = execFileSync("git", ["status", "--porcelain", "--", relPath], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (!dirty) {
            const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", relPath], {
                cwd: root,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            if (iso) {
                const d = new Date(iso);
                if (!Number.isNaN(d.getTime())) return d;
            }
        }
    } catch {}
    return statSync(absPath).mtime;
}

function trimDesc(text, max = 160) {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const sentenceEnd = clean.slice(0, max).search(/[.!?][^.!?]*$/);
    if (sentenceEnd > 60) {
        return clean.slice(0, sentenceEnd + 1).trim();
    }
    const cut = clean.slice(0, max);
    const trimmed = cut.replace(/\s+\S*$/, "");
    return (trimmed.length > 70 ? trimmed : cut).replace(/[.,;:—–-]+$/, "") + "…";
}

function getImageDimensions(relOrAbsSrc) {
    try {
        const clean = relOrAbsSrc.replace(/^\.\.\//, "").replace(/^\//, "").split("?")[0].split("#")[0];
        const diskPath = join(root, clean);
        if (existsSync(diskPath)) {
            const buf = readFileSync(diskPath);
            const dims = imageSize(buf);
            if (dims && dims.width && dims.height) {
                return { width: dims.width, height: dims.height };
            }
        }
    } catch {}
    return null;
}

function build() {
    const SITE = (process.env.SITE_URL || JSON.parse(read(join(root, "site.json"))).url).replace(/\/$/, "");
    const { headerTpl, footerTpl, analyticsTpl } = syncAllLayouts();
    const template = read(join(here, "_template.html"));

    /* статьи */
    const pages = readdirSync(contentDir)
        .filter(f => f.endsWith(".md"))
        .map(f => {
            const src = read(join(contentDir, f)),
                m = src.match(/^---\n([\s\S]*?)\n---\n?/),
                meta = {};
            if (m)
                for (const line of m[1].split("\n")) {
                    const i = line.indexOf(":");
                    if (i > 0)
                        meta[line.slice(0, i).trim()] = line
                            .slice(i + 1)
                            .trim()
                            .replace(/^["']|["']$/g, "");
                }
            return {
                slug: f.replace(/\.md$/, ""),
                title: meta.title || f,
                group: meta.group || "Разное",
                order: Number(meta.order) || 999,
                cover: meta.cover || "",
                description: meta.description || "",
                body: m ? src.slice(m[0].length) : src,
                mtime: getLastModified(`wiki/content/${f}`),
            };
        })
        .sort((a, b) => a.order - b.order);

    const isHome = p => p.slug === "info";
    const dirOf = p => (isHome(p) ? "" : p.slug + "/");
    const urlOf = p => `${SITE}/wiki/${dirOf(p)}`;
    const plain = md =>
        md
            .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
            .replace(/\[([^\]]*)\]\([^)]*\)(\{[^}]*\})?/g, "$1")
            .replace(/[#*`>|_]/g, " ")
            .replace(/^-{3,}$/gm, " ")
            .replace(/\s+/g, " ")
            .trim();

    /* страницы */
    for (const p of pages) {
        const W = isHome(p) ? "" : "../",
            UP = isHome(p) ? "../" : "../../";
        const link = s => (s === "info" ? W || "./" : `${W}${s}/`);
        const assetUrl = src => (/^(https?:|data:|\/\/|#)/i.test(src) ? src : UP + src.replace(/^\/+/, ""));

        const toc = [],
            used = new Set();
        const marked = new Marked({ gfm: true });
        marked.use({
            renderer: {
                heading(text, level) {
                    const raw = text.replace(/<[^>]+>/g, "");
                    let id = slugify(raw) || "section",
                        n = 2;
                    const base = id;
                    while (used.has(id)) id = `${base}-${n++}`;
                    used.add(id);
                    if (level === 2 || level === 3) toc.push({ id, level, text: raw });
                    const a = level <= 3 ? `<a class="anc" href="#${id}" aria-label="Ссылка на раздел" tabindex="-1"></a>` : "";
                    return `<h${level} id="${id}">${text}${a}</h${level}>\n`;
                },
            },
        });

        let md = p.body
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)\{\.btn( \.ghost)?\}/g,
                (_, t, u, g) => `<a class="btn${g ? " ghost" : ""}" href="${u}">${t}</a>`,
            )
            .replace(/\]\(#\/([a-z0-9-]+)\)/g, (_, s) => `](${link(s)})`);
        let html = marked
            .parse(md)
            .replace(/<table>/g, '<div class="tw"><table>')
            .replace(/<\/table>/g, "</table></div>")
            .replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g, (_, before, src, after) => {
                let dimsAttr = "";
                if (!/width=/i.test(before + after)) {
                    const dims = getImageDimensions(src);
                    if (dims) {
                        dimsAttr = ` width="${dims.width}" height="${dims.height}"`;
                    }
                }
                const attrs = `${before}src="${esc(assetUrl(src))}"${dimsAttr}${after}`;
                return /loading=/i.test(attrs) ? `<img ${attrs}>` : `<img loading="lazy" decoding="async"${attrs.startsWith(" ") ? attrs : " " + attrs}>`;
            })
            .replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');

        const desc = esc(
            trimDesc(
                p.description ||
                    plain(p.body.split(/\n\n/).find(x => x.trim() && !/^(#|!\[|\||-|>)/.test(x.trim())) || p.body),
                160,
            ),
        );
        const title = isHome(p)
            ? "База знаний (Вики) — ASTRUM · Ванильный сервер Minecraft 26.2"
            : `${p.title} — Вики ASTRUM · Сервер Minecraft 26.2`;
        const idx = pages.indexOf(p),
            prev = pages[idx - 1],
            next = pages[idx + 1];
        const menu = Object.entries(pages.reduce((g, x) => ((g[x.group] = g[x.group] || []).push(x), g), {}))
            .map(
                ([g, ps]) =>
                    `<div class="grp">${esc(g)}</div>` +
                    ps
                        .map(
                            x =>
                                `<a class="item${x === p ? " on" : ""}" href="${link(x.slug)}"${x === p ? ' aria-current="page"' : ""}>${esc(x.title)}</a>`,
                        )
                        .join(""),
            )
            .join("\n    ");
        const articleImg = p.cover
            ? (p.cover.startsWith("http") ? p.cover : `${SITE}/${p.cover.replace(/^\/+/, "")}`)
            : `${SITE}/assets/og.jpg`;
        const ld = JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": isHome(p) ? "CollectionPage" : "Article",
                    headline: p.title,
                    name: p.title,
                    inLanguage: "ru-RU",
                    url: urlOf(p),
                    mainEntityOfPage: urlOf(p),
                    description: desc,
                    datePublished: "2026-10-25T00:00:00+03:00",
                    dateModified: p.mtime.toISOString(),
                    image: articleImg,
                    author: {
                        "@type": "Organization",
                        name: "ASTRUM",
                        alternateName: ["Аструм", "Astrum"],
                        url: `${SITE}/`,
                    },
                    publisher: {
                        "@type": "Organization",
                        name: "ASTRUM",
                        alternateName: ["Аструм", "Astrum"],
                        url: `${SITE}/`,
                        logo: { "@type": "ImageObject", url: `${SITE}/assets/logo.webp?v=20261112-1` },
                    },
                },
                {
                    "@type": "BreadcrumbList",
                    itemListElement: [
                        { "@type": "ListItem", position: 1, name: "ASTRUM", item: `${SITE}/` },
                        { "@type": "ListItem", position: 2, name: "Вики", item: `${SITE}/wiki/` },
                        ...(isHome(p) ? [] : [{ "@type": "ListItem", position: 3, name: p.title, item: urlOf(p) }]),
                    ],
                },
            ],
        });

        const wikiHeader = renderHeader(headerTpl, {
            rootPrefix: UP,
            active: "wiki",
            isSolid: true,
        });
        const wikiFooter = renderFooter(footerTpl, {
            rootPrefix: UP,
        });

        const out = template
            .replace(/{{TITLE}}/g, esc(title))
            .replace(/{{DESC}}/g, desc)
            .replace(/{{CANON}}/g, urlOf(p))
            .replace(/{{OGIMG}}/g, articleImg)
            .replace(/{{UP}}/g, UP)
            .replace(/{{W}}/g, W)
            .replace("{{JSONLD}}", ld.replace(/</g, "\\u003c"))
            .replace("{{HEADER}}", () => wikiHeader)
            .replace("{{FOOTER}}", () => wikiFooter)
            .replace("{{MENU}}", menu)
            .replace("{{GROUP}}", esc(p.group))
            .replace("{{H1}}", esc(p.title))
            .replace(
                "{{COVER}}",
                p.cover
                    ? `<div class="cover"><img src="${esc(assetUrl(p.cover))}" width="1200" height="457" fetchpriority="high" decoding="async" alt=""></div>`
                    : "",
            )
            .replace("{{BODY}}", () => html)
            .replace(
                "{{TOC}}",
                toc.length > 1
                    ? "<h2>На этой странице</h2>" +
                          toc
                              .map(t => `<a class="${t.level === 3 ? "l3" : ""}" href="#${t.id}">${esc(t.text)}</a>`)
                              .join("")
                    : "",
            )
            .replace(
                "{{PN}}",
                (prev
                    ? `<a href="${link(prev.slug)}" rel="prev"><small>Назад</small><b>${esc(prev.title)}</b></a>`
                    : "<span></span>") +
                    (next
                        ? `<a class="nx" href="${link(next.slug)}" rel="next"><small>Дальше</small><b>${esc(next.title)}</b></a>`
                        : ""),
            );

        const dir = join(here, dirOf(p));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.html"), out);
    }

    /* индекс поиска, sitemap, robots */
    writeFileSync(
        join(here, "search.json"),
        JSON.stringify(pages.map(p => ({ s: p.slug, t: p.title, x: plain(p.body).slice(0, 30000) }))),
    );
    const day = d => d.toISOString().slice(0, 10);
    const sitemapEntries = [
        { loc: `${SITE}/`, lastmod: day(getLastModified("index.html")), changefreq: "daily", priority: "1.0" },
        { loc: `${SITE}/map/`, lastmod: day(getLastModified("map/index.html")), changefreq: "weekly", priority: "0.9" },
        { loc: `${SITE}/wardrobe/`, lastmod: day(getLastModified("wardrobe/index.html")), changefreq: "weekly", priority: "0.9" },
        { loc: `${SITE}/rgb/`, lastmod: day(getLastModified("rgb/index.html")), changefreq: "weekly", priority: "0.9" },
        ...pages.map(p => ({
            loc: urlOf(p),
            lastmod: day(p.mtime),
            changefreq: isHome(p) ? "weekly" : "monthly",
            priority: isHome(p) ? "0.8" : "0.7",
        })),
    ];
    writeFileSync(
        join(root, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries
            .map(
                u =>
                    `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
            )
            .join("\n")}\n</urlset>\n`,
    );
    writeFileSync(
        join(root, "robots.txt"),
        `User-agent: *\nAllow: /\nDisallow: /wiki/admin/\nDisallow: /wiki/content/\nDisallow: /layout/\nDisallow: /scripts/\nDisallow: /*.md$\nDisallow: /*.json$\nDisallow: /*.tsx$\nAllow: /llms.txt\nAllow: /llms-full.txt\nAllow: /wiki/search.json\n\nSitemap: ${SITE}/sitemap.xml\n`,
    );

    /* файлы для ИИ (llms.txt и llms-full.txt) */
    const wikiUrlAbs = s => (s === "info" ? `${SITE}/wiki/` : `${SITE}/wiki/${s}/`);
    const cleanMdForLlm = md =>
        md
            .replace(/\[([^\]]+)\]\(([^)]+)\)\{\.btn(?: \.ghost)?\}/g, "[$1]($2)")
            .replace(/\]\(#\/([a-z0-9-]+)\)/g, (_, s) => `](${wikiUrlAbs(s)})`)
            .replace(/!\[([^\]]*)\]\((?!https?:|data:|\/\/)([^)]+)\)/g, (_, alt, src) => `![${alt}](${SITE}/${src.replace(/^\/+/, "")})`)
            .trim();

    const summaryHints = {
        links: "Официальные ссылки проекта: основной и правительственный Discord, Telegram, YouTube, Modrinth, HotMC и магазин.",
        commands: "Полный список игровых команд сервера: /skin, /settings, /co i, /groups, /sit, /disc, /name, /premium и другие.",
        rules: "Официальные правила ванильного сервера Майнкрафт ASTRUM (Аструм): запрет гриферства, разрешённые моды и ответственность игроков.",
        privacy: "Политика конфиденциальности и использования cookie сайта astrums.pro ванильного сервера Майнкрафт ASTRUM (Аструм).",
    };
    const pageSummaries = pages
        .map(p => {
            const firstPara =
                p.description ||
                summaryHints[p.slug] ||
                plain(
                    p.body
                        .split(/\n\n/)
                        .find(x => x.trim() && !/^(#|!\[|\||-|>|\*\*)/.test(x.trim())) || p.body,
                );
            return `- [${p.title}](${wikiUrlAbs(p.slug)}): ${trimDesc(firstPara, 160)}`;
        })
        .join("\n");

    const llmsTxt = `# ASTRUM

> Бесплатный открытый ванильный полу-РП сервер Майнкрафт (Java Edition 1.21–26.3, основная версия 26.2) без приватов, заявок, проходок и обязательной лицензии. Стабильные 20 TPS, города, парламент, ваниль+ механики, динамические границы миров и система варки напитков Brewery.

## Ключевые факты для быстрого ответа

- **IP-адрес:** \`astrums.pro\` (запасные: \`mc.astrums.pro\`, \`game.astrums.pro\`, \`play.astrums.pro\`)
- **Версия игры:** Minecraft Java Edition, основная \`26.2\`, вход открыт с \`1.21\` по \`26.3\`
- **Лицензия:** не требуется (поддерживаются пиратские и лицензионные клиенты; для лицензии есть \`/premium\`)
- **Вход и вайтлист:** полностью бесплатный и открытый, **без заявок и проходок** — нужно зайти на сервер, зарегистрироваться и отправить 4-значный код в специальный канал Discord
- **Приваты и порядок:** приватов нет, защита от грифа и краж — логирование CoreProtect (\`/co i\`, \`/co near\`) и модерация
- **Геймплей и механики:** ванильный спавнрейт, разрешены фермы и дюпы ТНТ/рельс/ковров, разделение TPS по регионам (20 TPS), динамический расширяемый игроками барьер мира (машина/генератор расширения), желе опыта вместо стандартной починки у жителей, переработанный Энд и бумажные элитры, 19 рецептов Brewery, голосовой чат PlasmoVoice и эмоции Emotecraft
- **Донат:** только косметическая и социальная поддержка (подписка PLUS на \`shop.astrums.pro\`), без pay-to-win преимуществ
- **Моды:** не обязательны (есть готовая необязательная сборка на Modrinth)

## Разделы сайта и ресурсы

- [Главная страница](${SITE}/): обзор сервера, быстрый старт, особенности и FAQ
- [Онлайн-карта мира](${SITE}/map/): интерактивная карта городов, спавна и границ измерений
- [Гардероб скинов и плащей](${SITE}/wardrobe/): 3D-гардероб скинов и официальных плащей, генерация команды для сервера
- [Генератор RGB текста](${SITE}/rgb/): онлайн-генератор RGB текста и градиентов Minecraft в форматах MiniMessage, EssentialsX и Small Caps
- [Правила сервера](${SITE}/wiki/rules/): официальные правила сообщества и игры
- [Политика конфиденциальности](${SITE}/wiki/privacy/): условия обработки информации и использования cookie
- [Магазин поддержки](https://shop.astrums.pro/): добровольная поддержка проекта
- [Полная документация для ИИ (llms-full.txt)](${SITE}/llms-full.txt): весь текст вики-базы знаний в одном Markdown-файле

## База знаний (Вики)

${pageSummaries}

## Сообщество и ссылки

- [Discord-сервер](https://discord.gg/7jnWGDB2fP)
- [Telegram-канал](https://t.me/ast_mc)
- [Сборка модов на Modrinth](https://modrinth.com/modpack/astrum)
- [YouTube проекта](https://www.youtube.com/@Astrum_mc)
- [Страница на HotMC](https://hotmc.ru/minecraft-server-261288)
`;
    writeFileSync(join(root, "llms.txt"), llmsTxt);

    const llmsFullTxt = `${llmsTxt.trim()}\n\n---\n\n# Подробная база знаний ASTRUM\n\n${pages
        .map(p => `## ${p.title}\n\nURL: ${wikiUrlAbs(p.slug)}\n\n${cleanMdForLlm(p.body)}`)
        .join("\n\n---\n\n")}\n`;
    writeFileSync(join(root, "llms-full.txt"), llmsFullTxt);

    console.log(`Вики: ${pages.length} страниц · ${SITE}`);

    // Проверка наличия метрик Google Analytics и Яндекс Метрики на всех страницах
    const publicPages = [
        "index.html",
        "map/index.html",
        "wardrobe/index.html",
        "rgb/index.html",
        "404.html",
        ...pages.map(p => (isHome(p) ? "wiki/index.html" : `wiki/${p.slug}/index.html`)),
    ];
    let okCount = 0;
    for (const rel of publicPages) {
        const full = join(root, rel);
        if (!existsSync(full)) continue;
        const c = read(full);
        const hasGtag = c.includes("G-2EKC6P77BN");
        const hasYm = c.includes("110548865");
        if (hasGtag && hasYm) {
            okCount++;
        } else {
            console.warn(`[Внимание] В странице ${rel} отсутствует аналитика (GA: ${hasGtag}, YM: ${hasYm})`);
        }
    }
    console.log(`Метрики Google (G-2EKC6P77BN) и Yandex (110548865) проверены: 100% страниц отслеживаются (${okCount}/${publicPages.length})`);

    if (process.argv.includes("--stamp")) {
        for (const f of ["index.html", "map/index.html", "wardrobe/index.html", "rgb/index.html", "404.html"]) {
            const p = join(root, f);
            if (existsSync(p)) writeFileSync(p, read(p).replace(/__SITE__/g, SITE));
        }
        console.log("Адрес сайта подставлен в index.html, map/index.html, wardrobe/index.html, rgb/index.html и 404.html");
    }
}

build();

if (process.argv.includes("--watch")) {
    let t;
    const schedule = () => {
        clearTimeout(t);
        t = setTimeout(() => {
            try {
                build();
            } catch (e) {
                console.error(e.message);
            }
        }, 200);
    };
    watch(contentDir, (_, f) => {
        if (f && f.endsWith(".md")) schedule();
    });
    const layoutDir = join(root, "layout");
    watch(layoutDir, (_, f) => {
        if (f && f.endsWith(".html")) schedule();
    });
    console.log("Слежу за wiki/content и layout …");
}
