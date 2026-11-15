/**
 * ASTRUM — Minecraft RGB & MiniMessage Gradient Generator
 * Скрипт генератора градиентного текста для Minecraft (WYSIWYG в стиле Birdflop)
 */

(function () {
    'use strict';

    // ==========================================
    // ==========================================
    // 1. НАБОРЫ ШРИФТОВ (BIRDFLOP FONTS - ВСЕ 25 ШРИФТОВ)
    // Поддержка всех стилей с birdflop.com/resources/rgb
    // ==========================================
    const FONTS = (typeof window !== 'undefined' && window.BIRDFLOP_FONTS) ? window.BIRDFLOP_FONTS : {
        default: { name: 'Default Font', desc: 'Стандартный', map: null }
    };

    const FORMATS = {
        minimessage_tag: {
            name: 'MiniMessage',
            desc: '<gradient:#c1:#c2>'
        },
        minimessage_char: {
            name: 'MiniMessage (Legacy)',
            desc: '<#hex>'
        },
        essentials: {
            name: 'EssentialsX / CMI',
            desc: '&#rrggbb'
        },
        spigot_legacy: {
            name: 'Spigot / Bungee',
            desc: '&x&r&r&g&g&b&b'
        },
        section_sign: {
            name: 'Символ параграфа',
            desc: '§x§r§r§g§g§b§b'
        },
        json: {
            name: 'Vanilla JSON',
            desc: '/tellraw'
        },
        motd: {
            name: 'MOTD',
            desc: '\\u00A7x'
        }
    };

    function applyFont(text, fontKey) {
        if (!text) return '';
        const font = FONTS[fontKey];
        if (!font || fontKey === 'default') return text;

        if (font.map) {
            return Array.from(text).map(char => font.map[char] ?? char).join('');
        }
        if (font.convert) {
            return Array.from(text).map(char => font.convert(char)).join('');
        }
        return text;
    }

    // ==========================================
    // 2. МАТЕМАТИКА ЦВЕТОВ (HEX <-> RGB <-> HSV)
    // ==========================================
    function hexToRgb(hex) {
        let clean = hex.replace('#', '').trim();
        if (clean.length === 3) {
            clean = clean.split('').map(c => c + c).join('');
        }
        const num = parseInt(clean, 16);
        if (isNaN(num)) return { r: 255, g: 255, b: 255 };
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function rgbToHex(r, g, b) {
        const toHex = (c) => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;
        if (max !== min) {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h *= 60;
        }
        return { h: Math.round(h) % 360, s, v };
    }

    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor((h / 60) % 6);
        const f = (h / 60) - Math.floor(h / 60);
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
            default: r = v; g = p; b = q; break;
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    function getContrastColor(hex) {
        const rgb = hexToRgb(hex);
        if (!rgb) return '#FFFFFF';
        const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        return lum > 150 ? '#101010' : '#FFFFFF';
    }

    function getDarkerShadowColor(hex) {
        const rgb = hexToRgb(hex);
        return rgbToHex(rgb.r * 0.25, rgb.g * 0.25, rgb.b * 0.25);
    }

    function interpolateColorRgb(colors, t, stops = null) {
        if (!colors || colors.length === 0) return '#FFFFFF';
        if (colors.length === 1) return colors[0];
        if (t <= 0) return colors[0];
        if (t >= 1) return colors[colors.length - 1];

        if (!stops || stops.length !== colors.length) {
            stops = colors.map((_, i) => colors.length > 1 ? i / (colors.length - 1) : 0);
        }

        if (t <= stops[0]) return colors[0];
        if (t >= stops[stops.length - 1]) return colors[colors.length - 1];

        for (let i = 0; i < stops.length - 1; i++) {
            const s1 = stops[i];
            const s2 = stops[i + 1];
            if (t >= s1 && t <= s2) {
                const span = s2 - s1;
                const localT = span > 0.00001 ? (t - s1) / span : 0;
                const c1 = hexToRgb(colors[i]);
                const c2 = hexToRgb(colors[i + 1]);
                const r = c1.r + (c2.r - c1.r) * localT;
                const g = c1.g + (c2.g - c1.g) * localT;
                const b = c1.b + (c2.b - c1.b) * localT;
                return rgbToHex(r, g, b);
            }
        }

        return colors[colors.length - 1];
    }

    // ==========================================
    // 4. ГЕНЕРАТОР MINECRAFT ВЫВОДА
    // ==========================================
    function generateMinecraftOutput(rawText, colors, format, styles, stops = null) {
        if (!rawText) return '';

        const styleTags = [];
        let legacyStyleCodes = '';

        if (styles.bold) { styleTags.push('b'); legacyStyleCodes += '&l'; }
        if (styles.italic) { styleTags.push('i'); legacyStyleCodes += '&o'; }
        if (styles.underline) { styleTags.push('u'); legacyStyleCodes += '&n'; }
        if (styles.strikethrough) { styleTags.push('st'); legacyStyleCodes += '&m'; }
        if (styles.obfuscated) { styleTags.push('obf'); legacyStyleCodes += '&k'; }

        const lines = rawText.split('\n');

        const formattedLines = lines.map(line => {
            const chars = Array.from(line);
            if (chars.length === 0) return '';

            // 1. MiniMessage тег градиента: <gradient:#c1:#c2>текст</gradient>
            if (format === 'minimessage_tag') {
                const colorStr = colors.join(':');
                let openTags = `<gradient:${colorStr}>`;
                let closeTags = `</gradient>`;
                styleTags.forEach(t => {
                    openTags += `<${t}>`;
                    closeTags = `</${t}>` + closeTags;
                });
                return `${openTags}${line}${closeTags}`;
            }

            // 2. MiniMessage посимвольный: <#rrggbb>
            if (format === 'minimessage_char') {
                return chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops);
                    let tags = `<${hex}>`;
                    styleTags.forEach(st => { tags += `<${st}>`; });
                    return `${tags}${ch}`;
                }).join('');
            }

            // 3. EssentialsX / CMI: &#RRGGBB
            if (format === 'essentials') {
                return chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops);
                    return `&${hex}${legacyStyleCodes}${ch}`;
                }).join('');
            }

            // 4. Spigot / Bungee legacy: &x&r&r&g&g&b&b
            if (format === 'spigot_legacy') {
                return chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops).replace('#', '');
                    const bungeeHex = '&x' + hex.split('').map(c => `&${c}`).join('');
                    return `${bungeeHex}${legacyStyleCodes}${ch}`;
                }).join('');
            }

            // 5. Символ параграфа: §x§r...
            if (format === 'section_sign') {
                const sectionStyle = legacyStyleCodes.replace(/&/g, '§');
                return chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops).replace('#', '');
                    const sectionHex = '§x' + hex.split('').map(c => `§${c}`).join('');
                    return `${sectionHex}${sectionStyle}${ch}`;
                }).join('');
            }

            // 6. Vanilla JSON (/tellraw)
            if (format === 'json') {
                const parts = chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops);
                    const obj = { text: ch, color: hex };
                    if (styles.bold) obj.bold = true;
                    if (styles.italic) obj.italic = true;
                    if (styles.underline) obj.underlined = true;
                    if (styles.strikethrough) obj.strikethrough = true;
                    if (styles.obfuscated) obj.obfuscated = true;
                    return obj;
                });
                return JSON.stringify(['', ...parts]);
            }

            // 7. MOTD (\u00A7x...)
            if (format === 'motd') {
                return chars.map((ch, idx) => {
                    const t = chars.length > 1 ? idx / (chars.length - 1) : 0;
                    const hex = interpolateColorRgb(colors, t, stops).replace('#', '');
                    const motdHex = '\\u00A7x' + hex.split('').map(c => `\\u00A7${c}`).join('');
                    return `${motdHex}${ch}`;
                }).join('');
            }

            return line;
        });

        return formattedLines.join('\n');
    }

    // ==========================================
    // 5. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
    // ==========================================
    const state = {
        text: 'ASTRUM',
        font: 'default',
        format: 'minimessage_tag',
        colors: ['#F071DB', '#9B62E0', '#3B82F6'],
        stops: [0, 0.5, 1],
        styles: {
            bold: true,
            italic: false,
            underline: false,
            strikethrough: false,
            obfuscated: false
        },
        customShadow: true,
        rawMode: false,
        previewMode: 'default'
    };

    function ensureStops() {
        if (!Array.isArray(state.stops) || state.stops.length !== state.colors.length) {
            state.stops = state.colors.map((_, i) => state.colors.length > 1 ? i / (state.colors.length - 1) : 0);
        }
    }

    // ==========================================
    // 6. DOM-ЭЛЕМЕНТЫ
    // ==========================================
    const textInput = document.getElementById('rgb-text');
    const editorBox = document.getElementById('rgb-editor-box');
    const editorDisplay = document.getElementById('rgb-editor-display');
    const btnRawMode = document.getElementById('btn-raw-mode');
    const btnPreviewMode = document.getElementById('btn-preview-mode');
    const previewMenu = document.getElementById('rgb-preview-menu');
    const styleButtons = document.querySelectorAll('.rgb-style-btn[data-style]');
    const btnClearFormatting = document.getElementById('btn-clear-formatting');
    const sliderBar = document.getElementById('rgb-slider-bar');
    const colorCountEl = document.getElementById('rgb-color-count');
    const btnDecColors = document.getElementById('btn-dec-colors');
    const btnIncColors = document.getElementById('btn-inc-colors');
    const btnRandomColors = document.getElementById('btn-random-colors');
    const btnShuffleColors = document.getElementById('btn-shuffle-colors');
    const btnReverseColors = document.getElementById('btn-reverse-colors');
    const colorsCard = document.getElementById('rgb-card-colors');
    const colorsListContainer = document.getElementById('rgb-colors-list');
    const outputTextarea = document.getElementById('rgb-output');
    const presetsListEl = document.getElementById('rgb-presets-list');
    const btnSavePreset = document.getElementById('btn-save-preset');
    const btnCopy = document.getElementById('btn-copy');
    const btnShare = document.getElementById('btn-share');
    const toastEl = document.getElementById('rgb-toast');
    const toastTextEl = document.getElementById('rgb-toast-text');

    // Элементы кастомного меню выбора цвета (1 в 1 как на sakeva.net)
    const colorPopover = document.getElementById('rgb-color-popover');
    const pickerSb = document.getElementById('rgb-picker-sb');
    const pickerSbThumb = document.getElementById('rgb-picker-sb-thumb');
    const pickerPipetteBtn = document.getElementById('rgb-picker-pipette-btn');
    const pickerSwatch = document.getElementById('rgb-picker-swatch');
    const pickerHue = document.getElementById('rgb-picker-hue');
    const pickerHueThumb = document.getElementById('rgb-picker-hue-thumb');
    const pickerHex = document.getElementById('rgb-picker-hex');
    const pickerR = document.getElementById('rgb-picker-r');
    const pickerG = document.getElementById('rgb-picker-g');
    const pickerB = document.getElementById('rgb-picker-b');

    let activePopoverIndex = null;
    let popoverHsv = { h: 0, s: 1, v: 1 };

    // ==========================================
    // 7. СИНХРОНИЗАЦИЯ И РЕНДЕР (WYSIWYG)
    // ==========================================
    function updateAll(rebuildColors = true, rebuildSlider = true) {
        const transformedText = applyFont(state.text, state.font);
        ensureStops();

        // 1. Рендер живого текста внутри единого поля ввода
        if (editorDisplay) {
            const chars = Array.from(transformedText);
            if (chars.length === 0) {
                editorDisplay.innerHTML = '<span style="color: rgba(255,255,255,0.25); font-family: inherit;">Введите текст...</span>';
            } else {
                let html = '';
                let charIdx = 0;
                const totalChars = chars.filter(c => c !== '\n').length;

                for (let i = 0; i < chars.length; i++) {
                    const ch = chars[i];
                    if (ch === '\n') {
                        html += '<br>';
                        continue;
                    }

                    const t = totalChars > 1 ? charIdx / (totalChars - 1) : 0;
                    const hex = interpolateColorRgb(state.colors, t, state.stops);
                    const shadowHex = getDarkerShadowColor(hex);
                    const shadowStyle = `text-shadow: 3px 3px 0 ${shadowHex};`;

                    const classes = ['rgb-char-span'];
                    if (state.styles.bold) classes.push('is-bold');
                    if (state.styles.italic) classes.push('is-italic');
                    if (state.styles.underline) classes.push('is-underline');
                    if (state.styles.strikethrough) classes.push('is-strikethrough');

                    const displayChar = ch === ' ' ? ' ' : ch;
                    html += `<span class="${classes.join(' ')}" style="color: ${hex}; ${shadowStyle}">${displayChar}</span>`;
                    charIdx++;
                }
                if (transformedText.endsWith('\n')) {
                    html += '<br>&nbsp;';
                }
                editorDisplay.innerHTML = html;
            }
        }

        // 2. Рендер горизонтального слайдера
        if (rebuildSlider) {
            renderSlider();
        }

        // 3. Рендер списка цветов
        if (rebuildColors) {
            closeColorPopover();
            renderColorList();
        }

        // 4. Генерация и вывод кода в Output
        if (outputTextarea) {
            outputTextarea.value = generateMinecraftOutput(transformedText, state.colors, state.format, state.styles, state.stops);
        }

        // 5. Обновление счетчика цветов
        if (colorCountEl) {
            colorCountEl.textContent = state.colors.length;
        }

        // 6. Обновление классов стилей на поле ввода и контейнере
        if (textInput) {
            textInput.classList.toggle('is-bold', !!state.styles.bold);
            textInput.classList.toggle('is-italic', !!state.styles.italic);
            textInput.classList.toggle('is-underline', !!state.styles.underline);
            textInput.classList.toggle('is-strikethrough', !!state.styles.strikethrough);
        }
        if (editorBox) {
            editorBox.classList.toggle('is-bold', !!state.styles.bold);
            editorBox.classList.toggle('is-italic', !!state.styles.italic);
        }

        // Обновление кнопок стилей
        styleButtons.forEach(btn => {
            const style = btn.dataset.style;
            btn.classList.toggle('active', !!state.styles[style]);
        });

        // 7. Обновление текстов в кастомных селекторах
        syncDropdownUI();
    }

    // ==========================================
    // 8. РЕНДЕР СЛАЙДЕРА ГРАДИЕНТА С ПЕРЕТАСКИВАНИЕМ РАСПРЕДЕЛЕНИЯ
    // ==========================================
    function renderSlider() {
        if (!sliderBar) return;
        ensureStops();

        // Линейный градиент фона слайдера с учетом кастомных позиций
        const gradientCss = state.colors.map((c, idx) => {
            const pct = (state.stops[idx] * 100).toFixed(1);
            return `${c} ${pct}%`;
        }).join(', ');
        sliderBar.style.background = `linear-gradient(to right, ${gradientCss})`;

        // Ручки слайдера
        sliderBar.innerHTML = '';
        state.colors.forEach((color, idx) => {
            const pct = state.stops[idx] * 100;
            const handle = document.createElement('div');
            handle.className = 'rgb-slider-stop-handle';
            handle.style.left = `${pct}%`;
            handle.style.backgroundColor = color;
            handle.dataset.index = idx;
            handle.title = `Цвет ${idx + 1}: ${color} (${pct.toFixed(0)}%) — зажмите для настройки распределения`;

            let startX = 0;
            let hasMoved = false;

            handle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                handle.setPointerCapture(e.pointerId);
                startX = e.clientX;
                hasMoved = false;
                handle.classList.add('is-dragging');

                const sliderRect = sliderBar.getBoundingClientRect();
                const minStop = idx > 0 ? (state.stops[idx - 1] + 0.01) : 0;
                const maxStop = idx < state.colors.length - 1 ? (state.stops[idx + 1] - 0.01) : 1;

                function onPointerMove(ev) {
                    const deltaX = Math.abs(ev.clientX - startX);
                    if (deltaX > 2) {
                        hasMoved = true;
                    }
                    if (!hasMoved) return;

                    const currentX = ev.clientX - sliderRect.left;
                    let progress = currentX / sliderRect.width;
                    progress = Math.max(minStop, Math.min(maxStop, progress));

                    state.stops[idx] = progress;
                    handle.style.left = `${progress * 100}%`;
                    handle.title = `Цвет ${idx + 1}: ${color} (${(progress * 100).toFixed(0)}%)`;

                    // Обновляем градиент фона слайдера в реальном времени
                    const liveGrad = state.colors.map((c, i) => `${c} ${(state.stops[i] * 100).toFixed(1)}%`).join(', ');
                    sliderBar.style.background = `linear-gradient(to right, ${liveGrad})`;

                    // Обновляем текст и вывод без пересоздания DOM слайдера
                    updateAll(false, false);
                }

                function onPointerUp(ev) {
                    handle.removeEventListener('pointermove', onPointerMove);
                    handle.removeEventListener('pointerup', onPointerUp);
                    handle.removeEventListener('pointercancel', onPointerUp);
                    handle.classList.remove('is-dragging');

                    if (!hasMoved) {
                        // Это был просто клик по кружочку без перетаскивания -> открываем палитру
                        const paletteBtn = document.querySelector(`.rgb-color-row[data-index="${idx}"] .rgb-pill-palette-btn`);
                        if (paletteBtn) paletteBtn.click();
                    }
                }

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', onPointerUp);
                handle.addEventListener('pointercancel', onPointerUp);
            });

            sliderBar.appendChild(handle);
        });
    }

    // ==========================================
    // 9. КАСТОМНАЯ ПАЛИТРА ВЫБОРА ЦВЕТА (SAKEVA POPOVER)
    // ==========================================
    function openColorPopover(idx, triggerBtn) {
        if (!colorPopover || !colorsCard) return;
        activePopoverIndex = idx;
        const color = state.colors[idx];
        const rgb = hexToRgb(color);
        popoverHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

        pickerSb.style.backgroundColor = `hsl(${popoverHsv.h}, 100%, 50%)`;
        pickerSbThumb.style.left = `${popoverHsv.s * 100}%`;
        pickerSbThumb.style.top = `${(1 - popoverHsv.v) * 100}%`;

        pickerHueThumb.style.left = `${(popoverHsv.h / 360) * 100}%`;
        pickerHueThumb.style.backgroundColor = `hsl(${popoverHsv.h}, 100%, 50%)`;

        pickerSwatch.style.backgroundColor = color;
        pickerHex.value = color.toLowerCase();
        pickerR.value = rgb.r;
        pickerG.value = rgb.g;
        pickerB.value = rgb.b;

        colorPopover.hidden = false;

        const cardRect = colorsCard.getBoundingClientRect();
        const rowEl = triggerBtn.closest('.rgb-color-row');
        const rowRect = rowEl.getBoundingClientRect();

        const popoverH = 290;
        let top = (rowRect.top - cardRect.top) + 38;
        let left;

        if (window.innerWidth <= 640) {
            const popoverW = Math.min(286, cardRect.width - 16);
            left = Math.max(8, (cardRect.width - popoverW) / 2);

            const spaceBelow = window.innerHeight - rowRect.bottom;
            if (spaceBelow < 290 && (rowRect.top - cardRect.top) > 280) {
                top = Math.max(0, (rowRect.top - cardRect.top) - popoverH - 6);
            }
        } else if (window.innerWidth >= 960) {
            if (top + popoverH > cardRect.height + 40 && (rowRect.top - cardRect.top - popoverH) > 0) {
                top = (rowRect.top - cardRect.top) - popoverH + 10;
            }
            left = Math.max(10, Math.min(cardRect.width - 240, rowRect.right - cardRect.left - 240));
        } else {
            if (top + popoverH > cardRect.height + 40 && (rowRect.top - cardRect.top - popoverH) > 0) {
                top = (rowRect.top - cardRect.top) - popoverH + 10;
            }
            left = Math.max(8, (cardRect.width - 276) / 2);
        }

        colorPopover.style.top = `${Math.max(0, top)}px`;
        colorPopover.style.left = `${Math.max(0, left)}px`;

        if (window.innerWidth <= 640) {
            setTimeout(() => {
                const popRect = colorPopover.getBoundingClientRect();
                if (popRect.bottom > window.innerHeight) {
                    window.scrollBy({ top: popRect.bottom - window.innerHeight + 24, behavior: 'smooth' });
                }
            }, 60);
        }
    }

    function closeColorPopover() {
        if (!colorPopover) return;
        activePopoverIndex = null;
        colorPopover.hidden = true;
    }

    function syncColorFromHsv() {
        if (activePopoverIndex === null || activePopoverIndex >= state.colors.length) return;
        const rgb = hsvToRgb(popoverHsv.h, popoverHsv.s, popoverHsv.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        state.colors[activePopoverIndex] = hex;

        pickerSwatch.style.backgroundColor = hex;
        pickerHex.value = hex.toLowerCase();
        pickerR.value = rgb.r;
        pickerG.value = rgb.g;
        pickerB.value = rgb.b;

        updateSingleRowDom(activePopoverIndex, hex);
        updateAll(false);
    }

    function setPopoverColorFromHex(hex) {
        if (activePopoverIndex === null || activePopoverIndex >= state.colors.length) return;
        hex = hex.toUpperCase();
        const rgb = hexToRgb(hex);
        if (!rgb) return;
        popoverHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

        pickerSb.style.backgroundColor = `hsl(${popoverHsv.h}, 100%, 50%)`;
        pickerSbThumb.style.left = `${popoverHsv.s * 100}%`;
        pickerSbThumb.style.top = `${(1 - popoverHsv.v) * 100}%`;

        pickerHueThumb.style.left = `${(popoverHsv.h / 360) * 100}%`;
        pickerHueThumb.style.backgroundColor = `hsl(${popoverHsv.h}, 100%, 50%)`;

        pickerSwatch.style.backgroundColor = hex;
        if (document.activeElement !== pickerHex) pickerHex.value = hex.toLowerCase();
        if (document.activeElement !== pickerR) pickerR.value = rgb.r;
        if (document.activeElement !== pickerG) pickerG.value = rgb.g;
        if (document.activeElement !== pickerB) pickerB.value = rgb.b;

        state.colors[activePopoverIndex] = hex;
        updateSingleRowDom(activePopoverIndex, hex);
        updateAll(false);
    }

    function updateSingleRowDom(idx, hex) {
        if (!colorsListContainer) return;
        const row = colorsListContainer.querySelector(`.rgb-color-row[data-index="${idx}"]`);
        if (!row) return;
        const pill = row.querySelector('.rgb-color-pill');
        const input = row.querySelector('.rgb-pill-hex-input');
        const paletteBtn = row.querySelector('.rgb-pill-palette-btn');
        const contrast = getContrastColor(hex);
        if (pill) {
            pill.style.backgroundColor = hex;
            pill.style.color = contrast;
        }
        if (input && document.activeElement !== input) {
            input.value = hex;
            input.style.color = contrast;
        }
        if (paletteBtn) {
            paletteBtn.style.color = contrast;
        }
    }

    // Инициализация событий палитры popover
    if (pickerSb) {
        function handleSbPointer(e) {
            const rect = pickerSb.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            popoverHsv.s = x / rect.width;
            popoverHsv.v = 1 - (y / rect.height);
            pickerSbThumb.style.left = `${popoverHsv.s * 100}%`;
            pickerSbThumb.style.top = `${(1 - popoverHsv.v) * 100}%`;
            syncColorFromHsv();
        }

        pickerSb.addEventListener('pointerdown', (e) => {
            pickerSb.setPointerCapture(e.pointerId);
            handleSbPointer(e);
            const onMove = (ev) => handleSbPointer(ev);
            const onUp = (ev) => {
                pickerSb.removeEventListener('pointermove', onMove);
                pickerSb.removeEventListener('pointerup', onUp);
                pickerSb.removeEventListener('pointercancel', onUp);
            };
            pickerSb.addEventListener('pointermove', onMove);
            pickerSb.addEventListener('pointerup', onUp);
            pickerSb.addEventListener('pointercancel', onUp);
        });
    }

    if (pickerHue) {
        function handleHuePointer(e) {
            const rect = pickerHue.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const h = Math.round((x / rect.width) * 360) % 360;
            popoverHsv.h = h;
            pickerHueThumb.style.left = `${(h / 360) * 100}%`;
            pickerHueThumb.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
            pickerSb.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
            syncColorFromHsv();
        }

        pickerHue.addEventListener('pointerdown', (e) => {
            pickerHue.setPointerCapture(e.pointerId);
            handleHuePointer(e);
            const onMove = (ev) => handleHuePointer(ev);
            const onUp = (ev) => {
                pickerHue.removeEventListener('pointermove', onMove);
                pickerHue.removeEventListener('pointerup', onUp);
                pickerHue.removeEventListener('pointercancel', onUp);
            };
            pickerHue.addEventListener('pointermove', onMove);
            pickerHue.addEventListener('pointerup', onUp);
            pickerHue.addEventListener('pointercancel', onUp);
        });
    }

    if (pickerHex) {
        pickerHex.addEventListener('input', () => {
            let val = pickerHex.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                setPopoverColorFromHex(val);
            }
        });
    }

    function onRgbChange() {
        const r = Math.max(0, Math.min(255, parseInt(pickerR.value, 10) || 0));
        const g = Math.max(0, Math.min(255, parseInt(pickerG.value, 10) || 0));
        const b = Math.max(0, Math.min(255, parseInt(pickerB.value, 10) || 0));
        const hex = rgbToHex(r, g, b);
        setPopoverColorFromHex(hex);
    }
    if (pickerR) pickerR.addEventListener('input', onRgbChange);
    if (pickerG) pickerG.addEventListener('input', onRgbChange);
    if (pickerB) pickerB.addEventListener('input', onRgbChange);

    if (pickerPipetteBtn) {
        pickerPipetteBtn.addEventListener('click', async () => {
            if ('EyeDropper' in window) {
                try {
                    const eyeDropper = new window.EyeDropper();
                    const result = await eyeDropper.open();
                    if (result && result.sRGBHex) {
                        setPopoverColorFromHex(result.sRGBHex);
                        showToast(`Цвет взят: ${result.sRGBHex.toUpperCase()}`);
                    }
                } catch (err) {
                    // Cancelled
                }
            } else {
                showToast('EyeDropper не поддерживается в вашем браузере');
            }
        });
    }

    document.addEventListener('pointerdown', (e) => {
        if (!colorPopover || colorPopover.hidden) return;
        if (colorPopover.contains(e.target) || e.target.closest('.rgb-pill-palette-btn')) {
            return;
        }
        closeColorPopover();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && colorPopover && !colorPopover.hidden) {
            closeColorPopover();
        }
    });

    // ==========================================
    // 10. РЕНДЕР СПИСКА ЦВЕТОВ (1 В 1 SAKEVA)
    // ==========================================
    function renderColorList() {
        if (!colorsListContainer) return;
        colorsListContainer.innerHTML = '';

        state.colors.forEach((color, idx) => {
            const row = document.createElement('div');
            row.className = 'rgb-color-row';
            row.dataset.index = idx;

            const contrastColor = getContrastColor(color);

            row.innerHTML = `
                <span class="rgb-color-num">${idx + 1}</span>
                <button type="button" class="rgb-color-grip" title="Зажмите и перетащите для изменения порядка" aria-label="Переместить цвет">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                    </svg>
                </button>
                <div class="rgb-color-pill" style="background-color: ${color}; color: ${contrastColor};">
                    <input type="text" class="rgb-pill-hex-input" value="${color}" maxlength="7" spellcheck="false" autocomplete="off" title="Изменить HEX цвет">
                    <button type="button" class="rgb-pill-palette-btn" title="Выбрать цвет">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="13.5" cy="6.5" r=".75" fill="currentColor"/>
                            <circle cx="17.5" cy="10.5" r=".75" fill="currentColor"/>
                            <circle cx="8.5" cy="7.5" r=".75" fill="currentColor"/>
                            <circle cx="6.5" cy="12.5" r=".75" fill="currentColor"/>
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                        </svg>
                    </button>
                </div>
                <button type="button" class="rgb-color-del-btn" title="Удалить этот цвет" ${state.colors.length <= 2 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            `;

            const gripBtn = row.querySelector('.rgb-color-grip');
            const pillEl = row.querySelector('.rgb-color-pill');
            const hexInput = row.querySelector('.rgb-pill-hex-input');
            const paletteBtn = row.querySelector('.rgb-pill-palette-btn');
            const delBtn = row.querySelector('.rgb-color-del-btn');

            // Перетаскивание порядка цветов (Grip drag-to-reorder 1 в 1 как на sakeva.net)
            gripBtn.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                if (state.colors.length <= 1) return;

                e.preventDefault();
                e.stopPropagation();

                closeColorPopover();

                const fromIndex = idx;
                let targetIndex = fromIndex;
                const startY = e.clientY;
                let isDragging = false;

                try {
                    gripBtn.setPointerCapture(e.pointerId);
                } catch (_) {}

                const allRows = Array.from(colorsListContainer.querySelectorAll('.rgb-color-row'));
                let step = 46;
                if (allRows.length >= 2) {
                    const r0 = allRows[0].getBoundingClientRect();
                    const r1 = allRows[1].getBoundingClientRect();
                    const diff = r1.top - r0.top;
                    if (diff > 10) step = diff;
                } else if (allRows[0]) {
                    step = allRows[0].offsetHeight + 8;
                }

                const minDy = -fromIndex * step;
                const maxDy = (allRows.length - 1 - fromIndex) * step;

                function onPointerMove(moveEvent) {
                    const dy = moveEvent.clientY - startY;
                    if (!isDragging) {
                        if (Math.abs(dy) < 3) return;
                        isDragging = true;
                        document.body.classList.add('is-reordering-colors');
                        row.classList.add('is-dragging');
                    }

                    const clampedDy = Math.max(minDy - step * 0.35, Math.min(maxDy + step * 0.35, dy));
                    row.style.transition = 'none';
                    row.style.transform = `translateY(${clampedDy}px) scale(1.025)`;

                    const offsetSlots = Math.round(dy / step);
                    const newTargetIndex = Math.max(0, Math.min(allRows.length - 1, fromIndex + offsetSlots));
                    targetIndex = newTargetIndex;

                    allRows.forEach((sibling, i) => {
                        if (i === fromIndex) return;
                        let shiftY = 0;
                        if (fromIndex < newTargetIndex) {
                            if (i > fromIndex && i <= newTargetIndex) {
                                shiftY = -step;
                            }
                        } else if (fromIndex > newTargetIndex) {
                            if (i >= newTargetIndex && i < fromIndex) {
                                shiftY = step;
                            }
                        }
                        sibling.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
                        sibling.style.transform = shiftY !== 0 ? `translateY(${shiftY}px)` : '';
                    });
                }

                function onPointerUp(upEvent) {
                    gripBtn.removeEventListener('pointermove', onPointerMove);
                    gripBtn.removeEventListener('pointerup', onPointerUp);
                    gripBtn.removeEventListener('pointercancel', onPointerUp);

                    try {
                        if (gripBtn.hasPointerCapture(upEvent.pointerId)) {
                            gripBtn.releasePointerCapture(upEvent.pointerId);
                        }
                    } catch (_) {}

                    document.body.classList.remove('is-reordering-colors');

                    if (!isDragging) {
                        row.classList.remove('is-dragging');
                        row.style.transform = '';
                        row.style.transition = '';
                        return;
                    }

                    const finalDy = (targetIndex - fromIndex) * step;
                    row.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
                    row.style.transform = finalDy !== 0 ? `translateY(${finalDy}px) scale(1)` : '';

                    allRows.forEach((sibling, i) => {
                        if (i === fromIndex) return;
                        let shiftY = 0;
                        if (fromIndex < targetIndex) {
                            if (i > fromIndex && i <= targetIndex) shiftY = -step;
                        } else if (fromIndex > targetIndex) {
                            if (i >= targetIndex && i < fromIndex) shiftY = step;
                        }
                        sibling.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
                        sibling.style.transform = shiftY !== 0 ? `translateY(${shiftY}px)` : '';
                    });

                    setTimeout(() => {
                        row.classList.remove('is-dragging');
                        allRows.forEach(r => {
                            r.style.transform = '';
                            r.style.transition = '';
                        });

                        if (targetIndex !== fromIndex) {
                            const movedColor = state.colors.splice(fromIndex, 1)[0];
                            state.colors.splice(targetIndex, 0, movedColor);
                            updateAll(true);
                            showToast(`Цвет перемещён на позицию ${targetIndex + 1}`);
                        }
                    }, 180);
                }

                gripBtn.addEventListener('pointermove', onPointerMove);
                gripBtn.addEventListener('pointerup', onPointerUp);
                gripBtn.addEventListener('pointercancel', onPointerUp);
            });

            // Открытие кастомной палитры
            paletteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!colorPopover.hidden && activePopoverIndex === idx) {
                    closeColorPopover();
                } else {
                    openColorPopover(idx, paletteBtn);
                }
            });

            // Прямой ввод HEX в капсуле
            hexInput.addEventListener('input', () => {
                let val = hexInput.value.trim().toUpperCase();
                if (!val.startsWith('#') && val.length > 0) val = '#' + val;

                if (/^#[0-9A-F]{6}$/.test(val)) {
                    state.colors[idx] = val;
                    const c = getContrastColor(val);
                    pillEl.style.backgroundColor = val;
                    pillEl.style.color = c;
                    hexInput.style.color = c;
                    paletteBtn.style.color = c;
                    if (!colorPopover.hidden && activePopoverIndex === idx) {
                        setPopoverColorFromHex(val);
                    }
                    updateAll(false);
                }
            });

            hexInput.addEventListener('blur', () => {
                let val = hexInput.value.trim().toUpperCase();
                if (!val.startsWith('#')) val = '#' + val;
                if (!/^#[0-9A-F]{6}$/.test(val)) {
                    hexInput.value = state.colors[idx];
                } else {
                    state.colors[idx] = val;
                    updateAll(false);
                }
            });

            hexInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') hexInput.blur();
            });

            // Удаление цвета
            delBtn.addEventListener('click', () => {
                if (state.colors.length <= 2) return;
                state.colors.splice(idx, 1);
                if (state.stops) state.stops.splice(idx, 1);
                ensureStops();
                closeColorPopover();
                updateAll(true);
            });

            colorsListContainer.appendChild(row);
        });
    }

    // ==========================================
    // 10. СОХРАНЁННЫЕ ПРЕСЕТЫ ПОЛЬЗОВАТЕЛЯ (КАК В ГАРДЕРОБЕ)
    // ==========================================
    const PRESETS_STORAGE_KEY = 'astrum_saved_rgb_presets';

    function getSavedPresets() {
        try {
            const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function savePresetsToStorage(presets) {
        try {
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
        } catch (e) {
            console.error('Ошибка сохранения пресетов в localStorage:', e);
        }
    }

    // ==========================================
    // ДЕКОДЕР СТРОКИ (MiniMessage, Essentials, Spigot)
    // ==========================================
    function decodeTextString(rawVal) {
        if (!rawVal || typeof rawVal !== 'string') return null;
        const val = rawVal.trim();
        if (!val) return null;

        // 1. MiniMessage gradient: <gradient:#c1:#c2...>text</gradient>
        const mmMatch = val.match(/<gradient:([^>]+)>(.*?)<\/gradient>/is);
        if (mmMatch) {
            const rawColors = mmMatch[1].split(':');
            const colors = rawColors.map(c => {
                let clean = c.trim();
                if (!clean.startsWith('#')) clean = '#' + clean;
                return clean.toUpperCase();
            }).filter(c => /^#[0-9A-F]{6}$/i.test(c));

            let inner = mmMatch[2];
            const styles = { bold: false, italic: false, underline: false, strikethrough: false, obfuscated: false };
            if (/<b(?:old)?>/i.test(inner)) styles.bold = true;
            if (/<i(?:talic)?>/i.test(inner)) styles.italic = true;
            if (/<u(?:nderline)?>/i.test(inner)) styles.underline = true;
            if (/<(?:s|strikethrough)>/i.test(inner)) styles.strikethrough = true;
            if (/<(?:obf|obfuscated)>/i.test(inner)) styles.obfuscated = true;

            const cleanText = inner.replace(/<[^>]+>/g, '');
            return {
                text: cleanText,
                colors: colors.length >= 2 ? colors : null,
                styles
            };
        }

        // 2. Поиск HEX кодов &#RRGGBB или #RRGGBB или Spigot &x&r&r... / §x§r...
        let normalized = val.replace(/[&§]x[&§]([0-9a-fA-F])[&§]([0-9a-fA-F])[&§]([0-9a-fA-F])[&§]([0-9a-fA-F])[&§]([0-9a-fA-F])[&§]([0-9a-fA-F])/gi, (m, c1, c2, c3, c4, c5, c6) => '#' + c1 + c2 + c3 + c4 + c5 + c6);

        const hexMatches = normalized.match(/#[0-9A-Fa-f]{6}/g);
        if (hexMatches && hexMatches.length >= 2) {
            const colors = hexMatches.map(c => c.toUpperCase());
            const styles = { bold: false, italic: false, underline: false, strikethrough: false, obfuscated: false };
            if (/[&§][lL]/i.test(normalized)) styles.bold = true;
            if (/[&§][oO]/i.test(normalized)) styles.italic = true;
            if (/[&§][nN]/i.test(normalized)) styles.underline = true;
            if (/[&§][mM]/i.test(normalized)) styles.strikethrough = true;
            if (/[&§][kK]/i.test(normalized)) styles.obfuscated = true;

            const cleanText = normalized
                .replace(/&?#[0-9A-Fa-f]{6}/g, '')
                .replace(/[&§][0-9a-fk-or]/gi, '');

            return {
                text: cleanText,
                colors,
                styles
            };
        }

        return null;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function truncatePresetText(text, maxLen = 28) {
        if (!text) return '';
        const clean = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length > maxLen) {
            return clean.slice(0, maxLen).trim() + '…';
        }
        return clean;
    }

    function saveCurrentPreset() {
        const singleLineText = state.text ? state.text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
        const defaultName = singleLineText
            ? `${singleLineText.slice(0, 18)} (${state.colors.length} цв.)`
            : `Градиент ${state.colors.length} цв.`;

        const name = prompt('Введите название для вашего пресета:', defaultName);
        if (name === null) return;

        const finalName = name.trim() || defaultName;
        const currentOutput = outputTextarea
            ? outputTextarea.value
            : generateMinecraftOutput(applyFont(state.text, state.font), state.colors, state.format, state.styles, state.stops);

        const newPreset = {
            id: 'rgb_' + Date.now(),
            name: finalName,
            date: new Date().toISOString(),
            // Цвета и распределение
            colors: [...state.colors],
            stops: [...state.stops],
            // Текст и выбранный шрифт
            text: state.text,
            font: state.font || 'default',
            // Формат и оформление (bold, italic, underline, strikethrough, obfuscated)
            format: state.format || 'minimessage_tag',
            styles: { ...state.styles },
            customShadow: state.customShadow !== undefined ? state.customShadow : true,
            // Сгенерированный вывод
            output: currentOutput
        };

        const list = getSavedPresets();
        list.unshift(newPreset);
        savePresetsToStorage(list);
        renderSavedPresets();
        showToast(`Пресет «${finalName}» сохранён!`);
    }

    function deleteSavedPreset(id) {
        if (!confirm('Удалить этот пресет?')) return;
        let list = getSavedPresets();
        list = list.filter(p => p.id !== id);
        savePresetsToStorage(list);
        renderSavedPresets();
        showToast('Пресет удалён');
    }

    function renderSavedPresets() {
        if (!presetsListEl) return;
        const presets = getSavedPresets();

        if (!presets || presets.length === 0) {
            presetsListEl.innerHTML = `
                <div class="rgb-presets-empty">
                    У вас пока нет сохранённых пресетов.<br />
                    Нажмите <strong>«Сохранить»</strong> вверху, чтобы сохранить текущий градиент, текст и оформление в память браузера.
                </div>
            `;
            return;
        }

        presetsListEl.innerHTML = '';
        presets.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'rgb-preset-card';
            card.dataset.id = item.id;

            const stops = item.stops && item.stops.length === item.colors.length
                ? item.stops
                : item.colors.map((_, idx) => item.colors.length > 1 ? idx / (item.colors.length - 1) : 0);

            const gradientCss = item.colors.map((c, idx) => {
                const pct = (stops[idx] * 100).toFixed(1);
                return `${c} ${pct}%`;
            }).join(', ');

            let styleBadgesHtml = '';
            if (item.styles) {
                const badges = [];
                if (item.styles.bold) badges.push('<span class="rgb-preset-style-badge is-bold" title="Жирный">B</span>');
                if (item.styles.italic) badges.push('<span class="rgb-preset-style-badge is-italic" title="Курсив">I</span>');
                if (item.styles.underline) badges.push('<span class="rgb-preset-style-badge is-underline" title="Подчёркнутый">U</span>');
                if (item.styles.strikethrough) badges.push('<span class="rgb-preset-style-badge is-strike" title="Зачёркнутый">S</span>');
                if (item.styles.obfuscated) badges.push('<span class="rgb-preset-style-badge is-obf" title="Магический">k</span>');
                if (badges.length > 0) {
                    styleBadgesHtml = `<div class="rgb-preset-style-badges">${badges.join('')}</div>`;
                }
            }

            const fontName = item.font && item.font !== 'default'
                ? ((window.FONT_LABELS && window.FONT_LABELS[item.font]) || (window.BIRDFLOP_FONTS && window.BIRDFLOP_FONTS[item.font] && window.BIRDFLOP_FONTS[item.font].name) || item.font)
                : '';

            const escapedName = escapeHtml(item.name);
            const rawText = item.text || '';
            const previewText = truncatePresetText(rawText, 28);
            const escapedFullText = escapeHtml(rawText);
            const escapedPreview = escapeHtml(previewText);

            card.innerHTML = `
                <div class="rgb-preset-card-top">
                    <div class="rgb-preset-card-preview" style="background-image: linear-gradient(to right, ${gradientCss});"></div>
                    <div class="rgb-preset-card-info">
                        <div class="rgb-preset-card-name" title="${escapedName}">${escapedName}</div>
                        ${rawText ? `<div class="rgb-preset-card-text" title="${escapedFullText}">«${escapedPreview}»</div>` : ''}
                        <div class="rgb-preset-card-meta">
                            <span class="rgb-preset-tag">${item.colors.length} цв.</span>
                            ${fontName ? `<span class="rgb-preset-tag font-tag" title="Шрифт">${escapeHtml(fontName)}</span>` : ''}
                            ${styleBadgesHtml}
                            <div class="rgb-preset-dots">
                                ${item.colors.map(c => `<span class="rgb-preset-dot" style="background-color: ${escapeHtml(c)};" title="${escapeHtml(c)}"></span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="rgb-preset-card-buttons">
                    <button type="button" class="rgb-preset-btn rgb-preset-apply">Применить</button>
                    <button type="button" class="rgb-preset-btn rgb-preset-copy" title="Скопировать готовый код">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button type="button" class="rgb-preset-btn rgb-preset-del" title="Удалить пресет">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            const btnApply = card.querySelector('.rgb-preset-apply');
            const btnCopy = card.querySelector('.rgb-preset-copy');
            const btnDel = card.querySelector('.rgb-preset-del');

            btnApply.addEventListener('click', () => {
                // 1. Применяем цвета и распределение
                if (Array.isArray(item.colors) && item.colors.length > 0) {
                    state.colors = [...item.colors];
                    state.stops = item.stops && item.stops.length === item.colors.length
                        ? [...item.stops]
                        : item.colors.map((_, i) => item.colors.length > 1 ? i / (item.colors.length - 1) : 0);
                }

                // 2. Применяем текст (напрямую или декодируя через Decoder)
                if (item.text !== undefined && item.text !== null) {
                    state.text = item.text;
                    if (textInput) textInput.value = state.text;
                } else if (item.output) {
                    const decoded = decodeTextString(item.output);
                    if (decoded) {
                        if (decoded.text) {
                            state.text = decoded.text;
                            if (textInput) textInput.value = state.text;
                        }
                        if (decoded.colors && (!state.colors || state.colors.length === 0)) {
                            state.colors = decoded.colors;
                            ensureStops();
                        }
                        if (decoded.styles) {
                            state.styles = { ...state.styles, ...decoded.styles };
                        }
                    }
                }

                // 3. Применяем выбранный шрифт
                if (item.font && FONTS[item.font]) {
                    state.font = item.font;
                }

                // 4. Применяем формат вывода
                if (item.format && FORMATS[item.format]) {
                    state.format = item.format;
                }

                // 5. Применяем стили оформления
                if (item.styles) {
                    state.styles = {
                        bold: !!item.styles.bold,
                        italic: !!item.styles.italic,
                        underline: !!item.styles.underline,
                        strikethrough: !!item.styles.strikethrough,
                        obfuscated: !!item.styles.obfuscated
                    };
                }

                // 6. Тень
                if (item.customShadow !== undefined) {
                    state.customShadow = !!item.customShadow;
                }

                closeColorPopover();
                updateAll(true);
                showToast(`Пресет «${item.name}» применён!`);
            });

            btnCopy.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = item.output || generateMinecraftOutput(
                    applyFont(item.text || state.text, item.font || 'default'),
                    item.colors,
                    item.format || 'minimessage_tag',
                    item.styles || state.styles,
                    item.stops
                );
                copyToClipboard(code, `Код пресета «${item.name}» скопирован!`);
            });

            btnDel.addEventListener('click', () => {
                deleteSavedPreset(item.id);
            });

            presetsListEl.appendChild(card);
        });
    }

    // ==========================================
    // 11. ВЫПАДАЮЩИЕ МЕНЮ ШРИФТОВ И ФОРМАТОВ (.ip-drop КАК НА ГЛАВНОЙ)
    // ==========================================
    function setupDropdown({ btnId, textId, menuId, items, selectedKey, onSelect }) {
        const btn = document.getElementById(btnId);
        const textSpan = document.getElementById(textId);
        const menu = document.getElementById(menuId);
        if (!btn || !menu) return;

        menu.innerHTML = '';
        Object.entries(items).forEach(([key, info]) => {
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'ip-drop-item' + (key === selectedKey ? ' active' : '');
            itemBtn.dataset.value = key;
            const descHtml = info.desc ? `<span>${info.desc}</span>` : '';
            itemBtn.innerHTML = `${info.name} ${descHtml}`;

            itemBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.hidden = true;
                btn.setAttribute('aria-expanded', 'false');
                menu.querySelectorAll('.ip-drop-item').forEach(b => b.classList.remove('active'));
                itemBtn.classList.add('active');
                if (textSpan) textSpan.textContent = info.name;
                onSelect(key);
            });
            menu.appendChild(itemBtn);
        });

        if (textSpan && items[selectedKey]) {
            textSpan.textContent = items[selectedKey].name;
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = btn.getAttribute('aria-expanded') === 'true';
            document.querySelectorAll('.ip-drop-menu').forEach(m => {
                if (m !== menu) m.hidden = true;
            });
            document.querySelectorAll('.ip-drop-btn').forEach(b => {
                if (b !== btn) b.setAttribute('aria-expanded', 'false');
            });
            menu.hidden = isExpanded;
            btn.setAttribute('aria-expanded', !isExpanded ? 'true' : 'false');
        });
    }

    function initDropdowns() {
        setupDropdown({
            btnId: 'rgb-font-btn',
            textId: 'rgb-font-btn-text',
            menuId: 'rgb-font-menu',
            items: FONTS,
            selectedKey: state.font,
            onSelect: (key) => {
                state.font = key;
                updateAll(false);
            }
        });

        setupDropdown({
            btnId: 'rgb-format-btn',
            textId: 'rgb-format-btn-text',
            menuId: 'rgb-format-menu',
            items: FORMATS,
            selectedKey: state.format,
            onSelect: (key) => {
                state.format = key;
                updateAll(false);
            }
        });

        // Закрытие меню при клике снаружи и по Escape
        document.addEventListener('click', () => {
            document.querySelectorAll('.ip-drop-menu').forEach(m => m.hidden = true);
            document.querySelectorAll('.ip-drop-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.ip-drop-menu').forEach(m => m.hidden = true);
                document.querySelectorAll('.ip-drop-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
            }
        });
    }

    function syncDropdownUI() {
        const fontText = document.getElementById('rgb-font-btn-text');
        const fontMenu = document.getElementById('rgb-font-menu');
        if (fontMenu && fontText && FONTS[state.font]) {
            fontText.textContent = FONTS[state.font].name;
            fontMenu.querySelectorAll('.ip-drop-item').forEach(b => {
                b.classList.toggle('active', b.dataset.value === state.font);
            });
        }

        const formatText = document.getElementById('rgb-format-btn-text');
        const formatMenu = document.getElementById('rgb-format-menu');
        if (formatMenu && formatText && FORMATS[state.format]) {
            formatText.textContent = FORMATS[state.format].name;
            formatMenu.querySelectorAll('.ip-drop-item').forEach(b => {
                b.classList.toggle('active', b.dataset.value === state.format);
            });
        }
    }

    // ==========================================
    // 12. ТОСТЫ И КОПИРОВАНИЕ
    // ==========================================
    function showToast(message) {
        if (!toastEl) return;
        if (toastTextEl) toastTextEl.textContent = message;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    async function copyToClipboard(text, successMsg) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast(successMsg || 'Скопировано в буфер обмена!');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(successMsg || 'Скопировано в буфер обмена!');
        }
    }

    // ==========================================
    // 13. URL ХЭШ (СОХРАНЕНИЕ / ПОДЕЛИТЬСЯ)
    // ==========================================
    function syncToHash() {
        const params = new URLSearchParams();
        params.set('text', state.text);
        params.set('colors', state.colors.map(c => c.replace('#', '')).join(','));
        if (state.stops && state.stops.length === state.colors.length) {
            params.set('stops', state.stops.map(s => s.toFixed(3)).join(','));
        }
        params.set('format', state.format);
        if (state.font !== 'default') params.set('font', state.font);
        if (state.styles.bold) params.set('b', '1');
        if (state.styles.italic) params.set('i', '1');
        if (state.styles.underline) params.set('u', '1');
        if (state.styles.strikethrough) params.set('s', '1');
        if (state.styles.obfuscated) params.set('k', '1');

        history.replaceState(null, '', `#${params.toString()}`);
    }

    function loadFromHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;
        try {
            const params = new URLSearchParams(hash);
            if (params.has('text')) state.text = params.get('text');
            if (params.has('colors')) {
                const arr = params.get('colors').split(',').map(c => '#' + c.replace('#', ''));
                if (arr.length >= 2) state.colors = arr;
            }
            if (params.has('stops')) {
                const sArr = params.get('stops').split(',').map(Number);
                if (sArr.length === state.colors.length && sArr.every(n => !isNaN(n))) {
                    state.stops = sArr;
                }
            }
            if (params.has('format') && FORMATS[params.get('format')]) {
                state.format = params.get('format');
            }
            if (params.has('font') && FONTS[params.get('font')]) {
                state.font = params.get('font');
            }
            if (params.has('b')) state.styles.bold = params.get('b') === '1';
            if (params.has('i')) state.styles.italic = params.get('i') === '1';
            if (params.has('u')) state.styles.underline = params.get('u') === '1';
            if (params.has('s')) state.styles.strikethrough = params.get('s') === '1';
            if (params.has('k')) state.styles.obfuscated = params.get('k') === '1';

            if (textInput) textInput.value = state.text;
        } catch (e) {
            console.error('Ошибка разбора URL hash:', e);
        }
    }

    // ==========================================
    // 14. СЛУШАТЕЛИ СОБЫТИЙ
    // ==========================================
    function setupEventListeners() {
        // Ввод текста в WYSIWYG поле
        if (textInput) {
            textInput.addEventListener('input', (e) => {
                state.text = e.target.value;
                updateAll();
            });

            // Синхронизация прокрутки (если текст превышает поле)
            textInput.addEventListener('scroll', () => {
                if (editorDisplay) {
                    editorDisplay.scrollTop = textInput.scrollTop;
                    editorDisplay.scrollLeft = textInput.scrollLeft;
                }
            });

            // Фокус на контейнере передаётся в textarea
            if (editorBox) {
                editorBox.addEventListener('click', () => {
                    textInput.focus();
                });
            }
        }

        // Переключение режима Raw Edit (карандаш)
        if (btnRawMode && editorBox) {
            btnRawMode.addEventListener('click', (e) => {
                e.stopPropagation();
                state.rawMode = !state.rawMode;
                btnRawMode.classList.toggle('active', state.rawMode);
                editorBox.classList.toggle('raw-mode', state.rawMode);
                showToast(state.rawMode ? 'Режим простого текста (Raw)' : 'Режим живого превью (WYSIWYG)');
            });
        }

        // Меню режима превью (Eye)
        if (btnPreviewMode && previewMenu) {
            btnPreviewMode.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = previewMenu.style.display === 'flex';
                previewMenu.style.display = isShown ? 'none' : 'flex';
            });

            document.addEventListener('click', () => {
                if (previewMenu) previewMenu.style.display = 'none';
            });

            previewMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    previewMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const mode = btn.dataset.mode;
                    state.previewMode = mode;
                    if (editorBox) {
                        editorBox.className = `rgb-editor-box ${mode !== 'default' ? 'mode-' + mode : ''} ${state.rawMode ? 'raw-mode' : ''}`;
                    }
                    previewMenu.style.display = 'none';
                });
            });
        }

        // Кнопки стилей (Bold, Italic, etc.)
        styleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.style;
                state.styles[style] = !state.styles[style];
                updateAll(false);
            });
        });

        // Сброс форматирования (🧹)
        if (btnClearFormatting) {
            btnClearFormatting.addEventListener('click', () => {
                state.styles.bold = false;
                state.styles.italic = false;
                state.styles.underline = false;
                state.styles.strikethrough = false;
                state.styles.obfuscated = false;
                state.font = 'default';
                updateAll(false);
                showToast('Форматирование сброшено');
            });
        }

        // Клик по слайдеру для добавления точки цвета
        if (sliderBar) {
            sliderBar.addEventListener('click', (e) => {
                // Если клик пришелся на кружочек-ручку, не добавляем новый цвет
                if (e.target.closest('.rgb-slider-stop-handle')) {
                    return;
                }
                if (state.colors.length >= 10) {
                    showToast('Максимум 10 цветов в градиенте');
                    return;
                }
                const rect = sliderBar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const progress = Math.max(0.01, Math.min(0.99, clickX / rect.width));

                ensureStops();
                let insertIndex = state.stops.findIndex(s => s > progress);
                if (insertIndex === -1) {
                    insertIndex = state.colors.length - 1;
                }
                if (insertIndex <= 0) insertIndex = 1;

                // Вычисляем цвет в точке клика и вставляем его в массив
                const newColor = interpolateColorRgb(state.colors, progress, state.stops);
                state.colors.splice(insertIndex, 0, newColor);
                state.stops.splice(insertIndex, 0, progress);
                updateAll(true);
                showToast('Добавлен цвет');
            });
        }

        // Кнопки счетчика [-] [+]
        if (btnDecColors) {
            btnDecColors.addEventListener('click', () => {
                if (state.colors.length <= 2) {
                    showToast('Минимум 2 цвета для градиента');
                    return;
                }
                state.colors.pop();
                if (state.stops) state.stops.pop();
                ensureStops();
                updateAll();
            });
        }

        if (btnIncColors) {
            btnIncColors.addEventListener('click', () => {
                if (state.colors.length >= 10) {
                    showToast('Максимум 10 цветов');
                    return;
                }
                const newColor = interpolateColorRgb(state.colors, 0.5, state.stops);
                state.colors.splice(state.colors.length - 1, 0, newColor);
                state.stops = state.colors.map((_, i) => i / (state.colors.length - 1));
                updateAll();
            });
        }

        // Случайные цвета (🎲)
        if (btnRandomColors) {
            btnRandomColors.addEventListener('click', () => {
                const randHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
                state.colors = [randHex(), randHex(), randHex(), randHex()];
                state.stops = state.colors.map((_, i) => i / (state.colors.length - 1));
                updateAll();
                showToast('Сгенерированы случайные цвета');
            });
        }

        // Перемешать цвета (🔀)
        if (btnShuffleColors) {
            btnShuffleColors.addEventListener('click', () => {
                state.colors.sort(() => Math.random() - 0.5);
                state.stops = state.colors.map((_, i) => i / (state.colors.length - 1));
                updateAll();
                showToast('Цвета перемешаны');
            });
        }

        // Развернуть порядок цветов (⇄)
        if (btnReverseColors) {
            btnReverseColors.addEventListener('click', () => {
                state.colors.reverse();
                if (state.stops) {
                    state.stops = state.stops.map(s => 1 - s).reverse();
                }
                updateAll(true);
                showToast('Порядок цветов развёрнут');
            });
        }

        // Сдвинуть цвета по кругу (↻)
        const btnCycleColors = document.getElementById('btn-cycle-colors');
        if (btnCycleColors) {
            btnCycleColors.addEventListener('click', () => {
                if (state.colors.length <= 1) return;
                state.colors.unshift(state.colors.pop());
                state.stops = state.colors.map((_, i) => i / (state.colors.length - 1));
                updateAll(true);
                showToast('Порядок цветов сдвинут по кругу');
            });
        }

        // Декодер строки в градиент
        const btnDecodeRun = document.getElementById('btn-decode-run');
        const decodeInput = document.getElementById('rgb-decode-input');
        if (btnDecodeRun && decodeInput) {
            btnDecodeRun.addEventListener('click', () => {
                const val = decodeInput.value.trim();
                if (!val) return;

                const res = decodeTextString(val);
                if (res) {
                    if (res.text !== undefined) {
                        state.text = res.text;
                        if (textInput) textInput.value = state.text;
                    }
                    if (res.colors && res.colors.length >= 2) {
                        state.colors = res.colors;
                        ensureStops();
                    }
                    if (res.styles) {
                        state.styles = { ...state.styles, ...res.styles };
                    }
                    updateAll(true);
                    showToast('Градиент и форматирование успешно распознаны!');
                } else {
                    showToast('Не удалось распознать формат');
                }
            });
        }

        // Кнопка Сохранить пресет (как в Гардеробе)
        if (btnSavePreset) {
            btnSavePreset.addEventListener('click', saveCurrentPreset);
        }

        // Копирование результата
        if (btnCopy && outputTextarea) {
            btnCopy.addEventListener('click', () => {
                copyToClipboard(outputTextarea.value, 'Результат скопирован!');
            });
        }

        // Поделиться ссылкой
        if (btnShare) {
            btnShare.addEventListener('click', () => {
                syncToHash();
                copyToClipboard(window.location.href, 'Ссылка на градиент скопирована!');
            });
        }
    }

    // ==========================================
    // 15. ЗАПУСК
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initDropdowns();
        renderSavedPresets();
        loadFromHash();
        setupEventListeners();
        updateAll(true);
    });

})();
