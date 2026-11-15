/**
 * Cloudflare Worker для Гардероба скинов ASTRUM
 * Проксирует запросы к MineSkin API и SkinsRestorer Axolotl, обходит CORS, кэширует скины по SHA-256
 * и позволяет генерировать скины как файлом, так и по ссылкам (Discord, Imgur и др.),
 * а также прикреплять официальные плащи Minecraft через официальный прокси SkinsRestorer (Axolotl).
 *
 * Инструкция по обновлению / развертыванию:
 * 1. Зайдите в https://dash.cloudflare.com -> Workers & Pages -> выберите ваш воркер (astrum-wardrobe-proxy).
 * 2. Нажмите "Edit code", замените весь код на содержимое этого файла и нажмите "Deploy".
 * 3. В Settings -> Variables and Secrets у вас уже добавлен Secret MINESKIN_API_KEY.
 */

const CORS_HEADERS = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
});

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    // Обработка CORS preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS(origin),
      });
    }

    // Healthcheck / Информация
    if (request.method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "astrum-wardrobe-proxy",
        version: "3.0.0",
        message: "API гардероба ASTRUM активно (поддерживает MineSkin v2 и SkinsRestorer Axolotl для плащей).",
        hasApiKey: Boolean(env.MINESKIN_API_KEY),
        endpoints: {
          "POST /": "Загрузка скина (multipart/form-data с полями 'skin', 'model', 'cape' или JSON с полями 'url', 'model', 'cape')",
        },
      }, 200, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Метод не поддерживается (используйте POST)" }, 405, origin);
    }

    try {
      let imageBuffer = null;
      let model = "classic"; // "classic" (Steve) | "slim" (Alex)
      let fileName = "skin.png";
      let capeUuid = null;

      const contentType = request.headers.get("content-type") || "";

      // ВАРИАНТ 1: Загрузка по ссылке (JSON: { url: "https://...", model: "classic", cape: "uuid..." })
      if (contentType.includes("application/json")) {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Неверный JSON в теле запроса" }, 400, origin);
        }

        const imageUrl = body.url ? String(body.url).trim() : "";
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
          return jsonResponse({ error: "Укажите корректную ссылку на изображение (начинающуюся с http:// или https://)" }, 400, origin);
        }

        if (body.model === "slim") model = "slim";

        const rawCape = body.cape || body.capeUuid;
        if (rawCape && typeof rawCape === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCape.trim())) {
          capeUuid = rawCape.trim().toLowerCase();
        }

        // Скачиваем изображение по ссылке (Discord, Imgur и др.)
        const imgRes = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AstrumWardrobe/3.0",
            "Accept": "image/png,image/*;q=0.9,*/*;q=0.8",
          },
        });

        if (!imgRes.ok) {
          return jsonResponse({
            error: `Не удалось скачать изображение по ссылке (код ошибки HTTP ${imgRes.status})`,
          }, 400, origin);
        }

        imageBuffer = await imgRes.arrayBuffer();
      }
      // ВАРИАНТ 2: Загрузка файла с устройства (multipart/form-data)
      else if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("skin") || formData.get("file");
        if (!file || typeof file === "string") {
          return jsonResponse({ error: "Файл скина не передан (ожидается поле 'skin')" }, 400, origin);
        }

        const modelField = formData.get("model");
        if (modelField === "slim") model = "slim";

        const rawCape = formData.get("cape") || formData.get("capeUuid");
        if (rawCape && typeof rawCape === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCape.trim())) {
          capeUuid = rawCape.trim().toLowerCase();
        }

        imageBuffer = await file.arrayBuffer();
        if (file.name) fileName = file.name;
      } else {
        return jsonResponse({
          error: "Неподдерживаемый формат данных. Используйте multipart/form-data или application/json",
        }, 400, origin);
      }

      // Валидация размера файла
      if (!imageBuffer || imageBuffer.byteLength > 150 * 1024) {
        return jsonResponse({ error: "Размер файла превышает лимит (максимум 150 КБ для скина Майнкрафт)" }, 400, origin);
      }
      if (imageBuffer.byteLength < 50) {
        return jsonResponse({ error: "Файл пуст или повреждён" }, 400, origin);
      }

      // Проверка PNG сигнатуры [137, 80, 78, 71, 13, 10, 26, 10]
      const bytes = new Uint8Array(imageBuffer);
      const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
                    bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
      if (!isPng) {
        return jsonResponse({ error: "Файл должен быть в формате PNG" }, 400, origin);
      }

      // Валидация размеров IHDR (64x64 или 64x32)
      if (bytes.length >= 24) {
        const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
        const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
        if (width !== 64 || (height !== 64 && height !== 32)) {
          return jsonResponse({
            error: `Неверные пропорции скина: ${width}×${height}. Разрешение скина Майнкрафт должно быть 64×64 или 64×32.`,
          }, 400, origin);
        }
      }

      // Вычисляем SHA-256 хэш скина для дедупликации и кэширования
      const hashBuffer = await crypto.subtle.digest("SHA-256", imageBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      const cacheKey = `skin:v3:${sha256}:${model}:${capeUuid || "nocape"}`;

      // Проверяем кэш в Cloudflare KV
      if (env.SKIN_CACHE) {
        try {
          const cachedJson = await env.SKIN_CACHE.get(cacheKey);
          if (cachedJson) {
            const cachedData = JSON.parse(cachedJson);
            if (cachedData.url && !cachedData.url.endsWith("/0")) {
              return jsonResponse({
                success: true,
                cached: true,
                ...cachedData,
              }, 200, origin);
            }
          }
        } catch (e) {
          console.warn("KV read error:", e);
        }
      }

      // -------------------------------------------------------------
      // СЦЕНАРИЙ 1: ВЫБРАН ПЛАЩ
      // Используем официальный прокси SkinsRestorer (Axolotl),
      // у которого есть подтверждённый MineSkin Cape Grant на официальные плащи!
      // -------------------------------------------------------------
      if (capeUuid) {
        const axolotlFormData = new FormData();
        axolotlFormData.append("file", new Blob([imageBuffer], { type: "image/png" }), fileName);
        axolotlFormData.append("variant", model === "slim" ? "slim" : "classic");
        axolotlFormData.append("cape", capeUuid);

        let axData = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const axRes = await fetch("https://axolotl.skinsrestorer.net/mineskin/skins", {
              method: "POST",
              headers: {
                "User-Agent": "AstrumWardrobe/3.0 (https://astrums.pro)",
              },
              body: axolotlFormData,
            });

            if (axRes.ok) {
              axData = await axRes.json();
              if (axData && axData.success && axData.skin?.url) {
                break;
              }
            }
          } catch (e) {
            console.warn(`Axolotl attempt ${attempt + 1} error:`, e);
          }

          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1200));
          }
        }

        if (axData && axData.success && axData.skin?.url) {
          const axolotlUrl = axData.skin.url; // "skinsrestorer-axolotl://v2/..."
          let mineskinUrl = "";
          let skinId = "";

          // Дешифруем адрес через Axolotl, чтобы получить чистую ссылку https://minesk.in/<uuid>
          try {
            const decryptRes = await fetch(
              `https://axolotl.skinsrestorer.net/mineskin/decrypt-url?encryptedUrl=${encodeURIComponent(axolotlUrl)}`,
              {
                headers: { "User-Agent": "AstrumWardrobe/3.0 (https://astrums.pro)" },
              }
            );
            if (decryptRes.ok) {
              const decData = await decryptRes.json();
              if (decData.url) {
                const parts = decData.url.split("/");
                const rawId = parts[parts.length - 1] || "";
                // Убираем дефисы! SkinsRestorer требует сплошной 32-символьный hex без дефисов
                skinId = rawId.replace(/-/g, "");
                mineskinUrl = `https://minesk.in/${skinId}`;
              }
            }
          } catch (e) {
            console.warn("Axolotl decrypt error:", e);
          }

          // Приоритетная ссылка: чистый https://minesk.in/<uuid>, либо сам axolotlUrl
          const finalUrl = mineskinUrl || axolotlUrl;

          const resultPayload = {
            url: finalUrl,
            mineskinUrl: mineskinUrl || finalUrl,
            mineskinPage: skinId ? `https://mineskin.org/${skinId}` : "",
            axolotlUrl,
            skinId,
            model,
            cape: capeUuid,
            capeApplied: true,
            command: `/skin url "${finalUrl}" ${model}`,
          };

          // Сохраняем в кэш KV (на 60 дней)
          if (env.SKIN_CACHE) {
            try {
              await env.SKIN_CACHE.put(cacheKey, JSON.stringify(resultPayload), {
                expirationTtl: 60 * 24 * 60 * 60,
              });
            } catch (e) {
              console.warn("KV write error:", e);
            }
          }

          return jsonResponse({
            success: true,
            cached: false,
            ...resultPayload,
          }, 200, origin);
        }

        // Если Axolotl вернул ошибку, пробуем дальше через стандартный MineSkin
        console.warn("Axolotl request failed, trying standard MineSkin fallback");
      }

      // -------------------------------------------------------------
      // СЦЕНАРИЙ 2: БЕЗ ПЛАЩА (ИЛИ FALLBACK)
      // Используем стандартный MineSkin API с вашим ключом MINESKIN_API_KEY
      // -------------------------------------------------------------
      const mineskinModel = model === "slim" ? "slim" : "steve";
      const mineskinFormData = new FormData();
      mineskinFormData.append("file", new Blob([imageBuffer], { type: "image/png" }), fileName);
      mineskinFormData.append("model", mineskinModel);
      mineskinFormData.append("visibility", "1"); // 1 = unlisted

      const headers = {
        "User-Agent": "AstrumWardrobe/3.0 (https://astrums.pro)",
      };
      const apiKey = env.MINESKIN_API_KEY ? env.MINESKIN_API_KEY.trim() : null;
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const msRes = await fetch("https://api.mineskin.org/generate/upload", {
        method: "POST",
        headers,
        body: mineskinFormData,
      });

      let msData = null;
      const msText = await msRes.text();
      try {
        msData = JSON.parse(msText);
      } catch {
        return jsonResponse({
          error: `Сервер MineSkin временно перегружен или вернул таймаут (код ${msRes.status}). Попробуйте ещё раз через несколько секунд.`,
        }, msRes.status >= 500 ? 502 : msRes.status, origin);
      }

      if (!msRes.ok || !msData || msData.error) {
        const rawError = msData?.error || msData?.message || `Ошибка MineSkin API (${msRes.status})`;
        return jsonResponse({ error: rawError }, msRes.status >= 400 && msRes.status < 500 ? msRes.status : 502, origin);
      }

      const rawSkinId = msData.idStr || msData.uuid || msData.data?.uuid || (msData.id && msData.id !== 0 ? String(msData.id) : "");
      const skinId = String(rawSkinId).replace(/-/g, "");
      const mineskinUrl = skinId ? `https://minesk.in/${skinId}` : "";
      const mineskinPage = skinId ? `https://mineskin.org/${skinId}` : "";
      const textureUrl = msData.data?.texture?.url || msData.texture?.url || msData.data?.texture?.urls?.skin || "";
      const finalUrl = (mineskinUrl && !mineskinUrl.endsWith("/0")) ? mineskinUrl : textureUrl;

      if (!finalUrl) {
        return jsonResponse({ error: "MineSkin не вернул валидный ID скина" }, 502, origin);
      }

      const resultPayload = {
        url: finalUrl,
        mineskinUrl,
        mineskinPage,
        textureUrl,
        skinId,
        model,
        cape: null,
        capeApplied: false,
        command: `/skin url "${finalUrl}" ${model}`,
      };

      if (env.SKIN_CACHE && skinId) {
        try {
          await env.SKIN_CACHE.put(cacheKey, JSON.stringify(resultPayload), {
            expirationTtl: 60 * 24 * 60 * 60,
          });
        } catch (e) {
          console.warn("KV write error:", e);
        }
      }

      return jsonResponse({
        success: true,
        cached: false,
        ...resultPayload,
      }, 200, origin);

    } catch (err) {
      console.error("Wardrobe worker error:", err);
      return jsonResponse({ error: err.message || "Внутренняя ошибка сервера" }, 500, origin);
    }
  },
};
