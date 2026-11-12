// Собирает вики в обычные HTML-страницы (для поисковиков и быстрой загрузки):
//   wiki/content/*.md  →  wiki/index.html, wiki/<статья>/index.html, wiki/search.json, sitemap.xml, robots.txt
// Запуск:  node wiki/build.mjs            (локально)
//          node wiki/build.mjs --watch    (пересобирать при каждом сохранении статьи)
//          node wiki/build.mjs --stamp    (в CI: подставить адрес сайта из site.json в index.html и map/index.html)
// Адрес сайта берётся из site.json — при подключении своего домена поменяйте его там.
import { Marked } from "marked";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function trimDesc(text, max = 155) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const trimmed = cut.replace(/\s+\S*$/, "");
    return (trimmed.length > 80 ? trimmed : cut).replace(/[.,;:—–-]+$/, "");
}

function build() {
    const SITE = (process.env.SITE_URL || JSON.parse(read(join(root, "site.json"))).url).replace(/\/$/, "");
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
                    const a = level <= 3 ? `<a class="anc" href="#${id}" aria-label="Ссылка на раздел">#</a>` : "";
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
                const attrs = `${before}src="${esc(assetUrl(src))}"${after}`;
                return /loading=/i.test(attrs) ? `<img ${attrs}>` : `<img loading="lazy" decoding="async" ${attrs}>`;
            })
            .replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');

        const desc = esc(
            trimDesc(
                p.description ||
                    plain(p.body.split(/\n\n/).find(x => x.trim() && !/^(#|!\[|\||-|>)/.test(x.trim())) || p.body),
                155,
            ),
        );
        const title = `${p.title} | Вики ASTRUM`;
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
        const ld = JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "TechArticle",
                    headline: p.title,
                    inLanguage: "ru-RU",
                    url: urlOf(p),
                    mainEntityOfPage: urlOf(p),
                    dateModified: p.mtime.toISOString().slice(0, 10),
                    image: `${SITE}/assets/og.jpg`,
                    publisher: {
                        "@type": "Organization",
                        name: "ASTRUM",
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

        const out = template
            .replace(/{{TITLE}}/g, esc(title))
            .replace(/{{DESC}}/g, desc)
            .replace(/{{CANON}}/g, urlOf(p))
            .replace(/{{OGIMG}}/g, `${SITE}/assets/og.jpg`)
            .replace(/{{UP}}/g, UP)
            .replace(/{{W}}/g, W)
            .replace("{{JSONLD}}", ld.replace(/</g, "\\u003c"))
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
    const urls = [
        [`${SITE}/`, day(getLastModified("index.html"))],
        [`${SITE}/map/`, day(getLastModified("map/index.html"))],
        ...pages.map(p => [urlOf(p), day(p.mtime)]),
    ];
    writeFileSync(
        join(root, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `<url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}\n</urlset>\n`,
    );
    writeFileSync(
        join(root, "robots.txt"),
        `User-agent: *\nAllow: /\nDisallow: /wiki/admin/\nSitemap: ${SITE}/sitemap.xml\n`,
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
        commands: "Полный список доступных команд сервера: /co i, /settings, /skin set, /groups, /sit, /lay, /crawl, /disc, /premium и другие.",
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
            return `- [${p.title}](${wikiUrlAbs(p.slug)}): ${trimDesc(firstPara, 155)}`;
        })
        .join("\n");

    const llmsTxt = `# ASTRUM

> Бесплатный открытый ванильный полу-РП сервер Майнкрафт (Java Edition 1.21–26.3, основная версия 26.2) без приватов, заявок, проходок и обязательной лицензии. Стабильные 20 TPS, города, парламент, ваниль+ механики и система варки напитков Brewery.

## Ключевые факты для быстрого ответа

- **IP-адрес:** \`astrums.pro\` (запасные: \`mc.astrums.pro\`, \`game.astrums.pro\`, \`play.astrums.pro\`)
- **Версия игры:** Minecraft Java Edition, основная \`26.2\`, вход открыт с \`1.21\` по \`26.3\`
- **Лицензия:** не требуется (поддерживаются пиратские и лицензионные клиенты; для лицензии есть \`/premium\`)
- **Вход и вайтлист:** полностью бесплатный и открытый, **без заявок и проходок** — нужно зайти на сервер, зарегистрироваться и отправить 4-значный код в специальный канал Discord
- **Приваты и порядок:** приватов нет, защита от грифа и краж — логирование CoreProtect (\`/co i\`, \`/co near\`) и модерация
- **Геймплей и механики:** ванильный спавнрейт, разрешены фермы и дюпы ТНТ/рельс/ковров, разделение TPS по регионам (20 TPS), расширяемый игроками барьер мира, желе опыта вместо стандартной починки у жителей, переработанный Энд и бумажные элитры, 19 рецептов Brewery, голосовой чат PlasmoVoice и эмоции Emotecraft
- **Донат:** только косметическая и социальная поддержка (подписка PLUS на \`shop.astrums.pro\`), без pay-to-win преимуществ
- **Моды:** не обязательны (есть готовая необязательная сборка на Modrinth)

## Разделы сайта и ресурсы

- [Главная страница](${SITE}/): обзор сервера, быстрый старт, особенности и FAQ
- [Онлайн-карта мира](${SITE}/map/): интерактивная карта городов, спавна и границ измерений
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

    if (process.argv.includes("--stamp")) {
        for (const f of ["index.html", "map/index.html"]) {
            const p = join(root, f);
            writeFileSync(p, read(p).replace(/__SITE__/g, SITE));
        }
        console.log("Адрес сайта подставлен в index.html и map/index.html");
    }
}

build();

if (process.argv.includes("--watch")) {
    let t;
    watch(contentDir, (_, f) => {
        if (f && f.endsWith(".md")) {
            clearTimeout(t);
            t = setTimeout(() => {
                try {
                    build();
                } catch (e) {
                    console.error(e.message);
                }
            }, 200);
        }
    });
    console.log("Слежу за wiki/content …");
}
