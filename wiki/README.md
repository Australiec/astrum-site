# Вики ASTRUM

Статьи — это файлы `wiki/content/*.md`. Писать их удобно в редакторе **Decap CMS**: `/wiki/admin/`.
При каждой публикации GitHub Actions собирает из статей обычные страницы (`/wiki/<статья>/`), `sitemap.xml` и `robots.txt`.

## Редактор

| | Адрес | Вход |
|---|---|---|
| Decap CMS | `https://astrums.pro/wiki/admin/` | «Войти через GitHub» (нужен Worker, см. ниже) |
| Запасной вход | `https://astrums.pro/wiki/admin/token.html` | токен GitHub (работает сразу) |

Данные: репозиторий `Australiec/astrum-site`, ветка `main`.

### Запасной вход по токену (1 минута)
GitHub → Settings → Developer settings → Personal access tokens → Fine-grained → Generate:
доступ только к репозиторию `astrum-site`, право **Contents: Read and write**. Токен вставляется в редактор.

### Вход в Decap через GitHub (один раз)
Decap на GitHub Pages нужен небольшой посредник для OAuth — бесплатный Cloudflare Worker.
1. GitHub → Settings → Developer settings → OAuth Apps → New: Homepage `https://astrums.pro/`,
   Callback URL `https://<имя-worker>.workers.dev/callback`. Запомните Client ID и создайте Client secret.
2. Cloudflare → Workers → Create: вставьте код из `wiki/admin/oauth-worker.js`.
   Variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (secret), `ALLOWED_ORIGIN` = `https://astrums.pro`.
3. В `wiki/admin/config.yml` раскомментируйте `base_url` и впишите адрес Worker. Готово.

## Как писать статью
Новая статья → адрес (латиницей), заголовок, раздел, порядок, обложка (по желанию), текст.
В тексте: заголовки H2/H3 (попадают в оглавление), списки, таблицы, картинки, `код`.
Врезка — строка с `>` в начале. Кнопка — `[Текст](ссылка){.btn}` или `{.btn .ghost}`.
Ссылка на другую статью — `[текст](#/адрес)`.

## Локально
Нужен Node.js. Из корня сайта:
```bash
npm install
node wiki/dev.mjs
```
Сайт — http://localhost:8080/, редактор — http://localhost:8080/wiki/admin/ (сохраняет прямо в файлы).

## Свой домен
Впишите его в `site.json` (`"url"`) — canonical, sitemap и Open Graph обновятся при следующей публикации.
Домен подключается в GitHub: Settings → Pages → Custom domain.

## Структура
```
index.html, map/        главная и карта
wiki/_template.html     шаблон страницы вики
wiki/content/*.md       статьи
wiki/build.mjs          сборка (страницы, поиск, sitemap, robots)
wiki/admin/             редактор (Decap, token.html, config.yml, oauth-worker.js)
site.json               адрес сайта
```
