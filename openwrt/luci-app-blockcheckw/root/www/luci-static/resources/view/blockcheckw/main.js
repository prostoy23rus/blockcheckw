'use strict';
'require view';
'require fs';
'require ui';

var HELPER_BIN = '/usr/bin/blockcheckw-helper';
var isRunning = false;
var pollInterval = null;
var logPollInterval = null;
var currentTarget = 'youtube';
var currentMode = 'turbo';
var doCircular = true;
var autoApply = true;
var activeLogTab = 'scanner';
var autoLogScroll = true;
var lastResults = [];
var lastCircular = '';
var zapretServicesData = {};

function checkHelperStatus() {
	return fs.exec(HELPER_BIN, ['status']).then(function(res) {
		if (res && res.code === 0 && res.stdout) {
			try {
				return JSON.parse(res.stdout);
			} catch (e) {}
		}
		return { status: 'idle', percent: 0, phase: 'Готов к работе', strategies: [] };
	}).catch(function() {
		return { status: 'idle', percent: 0, phase: 'Готов к работе', strategies: [] };
	});
}

function getZapretInfo() {
	return fs.exec(HELPER_BIN, ['info']).then(function(res) {
		if (res && res.code === 0 && res.stdout) {
			try {
				return JSON.parse(res.stdout);
			} catch (e) {}
		}
		return { zapret2_running: 'unknown', services: {} };
	}).catch(function() {
		return { zapret2_running: 'unknown', services: {} };
	});
}

function getLogs() {
	return fs.exec(HELPER_BIN, ['logs']).then(function(res) {
		if (res && res.code === 0 && res.stdout) {
			try {
				return JSON.parse(res.stdout);
			} catch (e) {}
		}
		return { scanner_log: '', zapret2_log: '', daemons: '' };
	}).catch(function() {
		return { scanner_log: '', zapret2_log: '', daemons: '' };
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			checkHelperStatus(),
			getZapretInfo(),
			getLogs()
		]);
	},

	render: function(data) {
		var statusData = data[0];
		var zapretInfo = data[1];
		var logsData = data[2];
		zapretServicesData = zapretInfo.services || {};

		var container = E('div', { class: 'cbi-map' });

		// Inject Responsive CSS Styles
		var styleSheet = E('style', {}, [
			'/* BlockcheckW Responsive Layout */\n' +
			'.bcw-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 20px; }\n' +
			'.bcw-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 10px; }\n' +
			'.bcw-target-btn { box-sizing: border-box; padding: 14px 16px; text-align: left; cursor: pointer; border-radius: 8px; border: 1px solid #3c3c3c; background: rgba(255,255,255,0.03); transition: all 0.2s ease; min-width: 0; word-break: break-word; }\n' +
			'.bcw-target-btn:hover { border-color: #3273dc; }\n' +
			'.bcw-target-btn.cbi-button-positive { border-color: #00d1b2 !important; background: rgba(0, 209, 178, 0.12) !important; box-shadow: 0 0 10px rgba(0, 209, 178, 0.2); }\n' +
			'.bcw-params-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: stretch; margin: 15px 0; }\n' +
			'.bcw-param-box { box-sizing: border-box; background: rgba(255,255,255,0.03); border: 1px solid #3a3a3a; border-radius: 6px; padding: 12px 14px; flex: 1 1 220px; min-width: 220px; display: flex; flex-direction: column; justify-content: flex-start; }\n' +
			'.bcw-actions-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 15px; }\n' +
			'.bcw-code-box { box-sizing: border-box; background: #1a1a1a; color: #abb2bf; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin: 0; max-height: 250px; overflow-y: auto; }\n' +
			'.bcw-log-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }\n' +
			'.bcw-log-tab-btn { padding: 6px 14px; font-size: 13px; cursor: pointer; border-radius: 4px; border: 1px solid #444; background: #222; color: #ddd; transition: background 0.2s; }\n' +
			'.bcw-log-tab-btn.active { background: #3273dc; color: #fff; border-color: #3273dc; font-weight: bold; }\n' +
			'@media (max-width: 900px) {\n' +
			'  .bcw-grid { grid-template-columns: repeat(2, 1fr); }\n' +
			'  .bcw-param-box { flex: 1 1 calc(50% - 16px); }\n' +
			'}\n' +
			'@media (max-width: 580px) {\n' +
			'  .bcw-header { flex-direction: column; align-items: flex-start; }\n' +
			'  .bcw-grid { grid-template-columns: 1fr; }\n' +
			'  .bcw-param-box { flex: 1 1 100%; min-width: 100%; }\n' +
			'  .bcw-actions-row button { width: 100%; }\n' +
			'}\n'
		]);
		container.appendChild(styleSheet);

		// Header
		var header = E('div', { class: 'bcw-header' }, [
			E('div', {}, [
				E('h2', { style: 'margin: 0; font-size: 22px;' }, '⚡ BlockcheckW — Поиск стратегий Zapret2'),
				E('div', { class: 'cbi-map-descr', style: 'margin-top: 4px;' }, [
					'Параллельный сканер и авто-оптимизатор DPI для роутера. Подбирает рабочие комбинации обхода, собирает Circular-связки и тестирует соединение.'
				])
			]),
			E('div', { style: 'display: flex; gap: 8px; align-items: center;' }, [
				E('span', {
					id: 'bcw-zapret-badge',
					class: (zapretInfo.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red',
					style: 'font-size: 13px; font-weight: bold; padding: 6px 12px; border-radius: 6px;'
				}, (zapretInfo.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен')
			])
		]);
		container.appendChild(header);

		// Target Selector Card (Responsive Grid)
		var targetCard = E('div', { class: 'cbi-section' }, [
			E('h3', {}, '1. Выберите сервис для обхода'),
			E('div', { class: 'bcw-grid' }, [
				E('div', {
					id: 'btn-target-youtube',
					class: 'bcw-target-btn' + (currentTarget === 'youtube' ? ' cbi-button-positive' : ''),
					click: function() { selectTarget('youtube'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 15px;' }, '📺 YouTube'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Видео, превью, 1080p/4K стримы (googlevideo)')
				]),
				E('div', {
					id: 'btn-target-discord',
					class: 'bcw-target-btn' + (currentTarget === 'discord' ? ' cbi-button-positive' : ''),
					click: function() { selectTarget('discord'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 15px;' }, '💬 Discord'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Голосовые каналы, шлюз, чат')
				]),
				E('div', {
					id: 'btn-target-general',
					class: 'bcw-target-btn' + (currentTarget === 'general' ? ' cbi-button-positive' : ''),
					click: function() { selectTarget('general'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 15px;' }, '🌐 Блокированные сайты'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Рутрекер, X/Twitter, Instagram, ntc.party')
				]),
				E('div', {
					id: 'btn-target-custom',
					class: 'bcw-target-btn' + (currentTarget === 'custom' ? ' cbi-button-positive' : ''),
					click: function() { selectTarget('custom'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 15px;' }, '🎯 Свой домен'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Указать произвольный заблокированный сайт')
				])
			]),
			E('div', { id: 'custom-domain-row', style: (currentTarget === 'custom' ? 'margin-top: 14px;' : 'display: none; margin-top: 14px;') }, [
				E('label', { style: 'font-weight: bold; margin-right: 8px;' }, 'Домен для проверки:'),
				E('input', {
					id: 'custom-domain-input',
					type: 'text',
					class: 'cbi-input-text',
					placeholder: 'example.com',
					style: 'width: 320px; max-width: 100%;'
				})
			])
		]);
		container.appendChild(targetCard);

		// Current Active Strategy Inspector Card
		var activeStratCard = E('div', { class: 'cbi-section', id: 'bcw-active-strat-card', style: 'border-left: 4px solid #3273dc;' }, [
			E('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px;' }, [
				E('h3', { style: 'margin: 0; display: flex; align-items: center; gap: 8px;' }, [
					'🔍 Активная стратегия в Zapret2:',
					E('span', { id: 'bcw-active-target-title', style: 'color: #3273dc;' }, 'YouTube')
				]),
				E('div', { style: 'display: flex; gap: 8px;' }, [
					E('button', {
						class: 'cbi-button cbi-button-neutral',
						style: 'padding: 4px 12px; font-size: 12px;',
						click: function() { copyActiveStrategy(); }
					}, '📋 Копировать'),
					E('button', {
						class: 'cbi-button cbi-button-action',
						style: 'padding: 4px 12px; font-size: 12px;',
						click: function() { testActiveConnection(); }
					}, '🌐 Проверить связь сейчас')
				])
			]),
			E('div', { id: 'bcw-active-strat-meta', style: 'font-size: 13px; opacity: 0.85; margin-bottom: 8px;' }, ''),
			E('pre', { id: 'bcw-active-strat-code', class: 'bcw-code-box' }, 'Загрузка текущей конфигурации...')
		]);
		container.appendChild(activeStratCard);

		// Parameters and Launch Card
		var actionCard = E('div', { class: 'cbi-section' }, [
			E('h3', {}, '2. Параметры поиска и применения'),
			E('div', { class: 'bcw-params-row' }, [
				// Box 1: Mode
				E('div', { class: 'bcw-param-box' }, [
					E('div', { style: 'font-weight: bold; margin-bottom: 8px;' }, 'Скорость сканирования:'),
					E('label', { style: 'display: flex; align-items: center; gap: 6px; cursor: pointer; margin-bottom: 6px;' }, [
						E('input', {
							type: 'radio',
							name: 'scan_mode',
							checked: (currentMode === 'turbo'),
							change: function() { currentMode = 'turbo'; }
						}),
						E('span', {}, [
							E('strong', {}, '⚡ Турбо-поиск (10-15 сек)'),
							E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Опрос лучших топ-пресетов 2026')
						])
					]),
					E('label', { style: 'display: flex; align-items: center; gap: 6px; cursor: pointer;' }, [
						E('input', {
							type: 'radio',
							name: 'scan_mode',
							checked: (currentMode === 'full'),
							change: function() { currentMode = 'full'; }
						}),
						E('span', {}, [
							E('strong', {}, '🔬 Глубокий скан'),
							E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Полный перебор всех стратегий')
						])
					])
				]),

				// Box 2: Auto-Apply Mode
				E('div', { class: 'bcw-param-box' }, [
					E('div', { style: 'font-weight: bold; margin-bottom: 8px;' }, 'Применение стратегии:'),
					E('label', { style: 'display: flex; align-items: center; gap: 6px; cursor: pointer; margin-bottom: 6px;' }, [
						E('input', {
							type: 'radio',
							name: 'apply_mode',
							checked: autoApply,
							change: function() { autoApply = true; }
						}),
						E('span', {}, [
							E('strong', { style: 'color: #00d1b2;' }, '⚡ Автоматически (Auto-Apply)'),
							E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Сам запишет и проверит результат')
						])
					]),
					E('label', { style: 'display: flex; align-items: center; gap: 6px; cursor: pointer;' }, [
						E('input', {
							type: 'radio',
							name: 'apply_mode',
							checked: !autoApply,
							change: function() { autoApply = false; }
						}),
						E('span', {}, [
							E('strong', {}, '✋ Вручную (По кнопке)'),
							E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Покажет варианты для выбора')
						])
					])
				]),

				// Box 3: Circular
				E('div', { class: 'bcw-param-box' }, [
					E('div', { style: 'font-weight: bold; margin-bottom: 8px;' }, 'Отказоустойчивость:'),
					E('label', { style: 'display: flex; align-items: flex-start; gap: 6px; cursor: pointer;' }, [
						E('input', {
							id: 'chk-circular',
							type: 'checkbox',
							checked: doCircular,
							style: 'margin-top: 3px;',
							change: function(e) { doCircular = e.target.checked; }
						}),
						E('span', {}, [
							E('strong', { style: 'color: #3273dc;' }, '🔄 Circular авто-ротация'),
							E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Связка 3-5 разных техник обхода (при сбое одной Zapret2 переключает на следующую)')
						])
					])
				])
			]),

			// Buttons Row
			E('div', { class: 'bcw-actions-row' }, [
				E('button', {
					id: 'btn-start-scan',
					class: 'cbi-button cbi-button-primary',
					style: 'padding: 10px 24px; font-size: 15px; font-weight: bold;',
					click: function() { startScan(); }
				}, '▶ Запустить поиск стратегий'),
				E('button', {
					id: 'btn-stop-scan',
					class: 'cbi-button cbi-button-reset',
					style: 'display: none; padding: 10px 20px;',
					click: function() { stopScan(); }
				}, '■ Остановить сканирование')
			])
		]);
		container.appendChild(actionCard);

		// Progress Monitor Card
		var monitorCard = E('div', { id: 'bcw-monitor-card', class: 'cbi-section', style: 'display: none;' }, [
			E('h3', { id: 'bcw-progress-phase' }, 'Прогресс сканирования'),
			E('div', { style: 'background: #2a2a2a; border-radius: 8px; height: 22px; width: 100%; overflow: hidden; margin: 10px 0; border: 1px solid #444;' }, [
				E('div', {
					id: 'bcw-progress-bar',
					style: 'background: linear-gradient(90deg, #3273dc, #00d1b2); height: 100%; width: 0%; transition: width 0.3s ease;'
				})
			]),
			E('div', { style: 'display: flex; justify-content: space-between; font-size: 13px; opacity: 0.85;' }, [
				E('span', { id: 'bcw-progress-text' }, 'Подготовка к запуску...'),
				E('span', { id: 'bcw-progress-percent' }, '0%')
			])
		]);
		container.appendChild(monitorCard);

		// Circular Strategy Result Card (Special Highlight)
		var circularCard = E('div', { id: 'bcw-circular-card', class: 'cbi-section', style: 'display: none; border: 2px solid #00d1b2; border-radius: 8px; background: rgba(0, 209, 178, 0.05);' }, [
			E('div', { style: 'display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px;' }, [
				E('h3', { style: 'margin: 0; color: #00d1b2; display: flex; align-items: center; gap: 8px;' }, [
					'🛡️ Собрана Circular-связка Zapret2',
					E('span', { class: 'badge cbi-color-green', style: 'font-size: 11px; padding: 2px 8px;' }, 'Авто-ротация')
				]),
				E('button', {
					id: 'btn-apply-circular',
					class: 'cbi-button cbi-button-positive',
					style: 'padding: 8px 20px; font-weight: bold; font-size: 14px;',
					click: function() { applyStrategy(lastCircular, true); }
				}, '✓ Применить Circular-связку в Zapret2')
			]),
			E('div', { style: 'font-size: 13px; margin-bottom: 10px;' }, [
				'Связка объединяет независимые техники обхода (Fake ClientHello, Multisplit, Multidisorder). При сбое одной стратегии Zapret2 автоматически переключается на следующую за 20 секунд!'
			]),
			E('pre', {
				id: 'bcw-circular-code',
				class: 'bcw-code-box',
				style: 'color: #98c379;'
			}, '')
		]);
		container.appendChild(circularCard);

		// Individual Results Section
		var resultsCard = E('div', { id: 'bcw-results-card', class: 'cbi-section', style: 'display: none;' }, [
			E('h3', {}, 'Найденные рабочие стратегии (100% проверено)'),
			E('div', { id: 'bcw-strategies-list', style: 'display: flex; flex-direction: column; gap: 12px; margin-top: 12px;' }, [])
		]);
		container.appendChild(resultsCard);

		// Dedicated Live Log Monitor Card (Always Available)
		var logCard = E('div', { class: 'cbi-section' }, [
			E('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px;' }, [
				E('h3', { style: 'margin: 0;' }, '📋 Мониторинг и логи службы'),
				E('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px; align-items: center;' }, [
					E('label', { style: 'font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;' }, [
						E('input', {
							type: 'checkbox',
							checked: autoLogScroll,
							change: function(e) { autoLogScroll = e.target.checked; }
						}),
						E('span', {}, 'Автоскролл')
					]),
					E('button', {
						class: 'cbi-button cbi-button-neutral',
						style: 'padding: 4px 12px; font-size: 12px;',
						click: function() { refreshLogs(); }
					}, '🔄 Обновить логи'),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						style: 'padding: 4px 10px; font-size: 12px;',
						click: function() { clearLogDisplay(); }
					}, 'Очистить')
				])
			]),
			// Tabs
			E('div', { class: 'bcw-log-tabs' }, [
				E('button', {
					id: 'tab-log-scanner',
					class: 'bcw-log-tab-btn active',
					click: function() { switchLogTab('scanner'); }
				}, '⚡ Лог сканера BlockcheckW'),
				E('button', {
					id: 'tab-log-zapret2',
					class: 'bcw-log-tab-btn',
					click: function() { switchLogTab('zapret2'); }
				}, '🛡️ Системный лог службы Zapret2'),
				E('button', {
					id: 'tab-log-daemons',
					class: 'bcw-log-tab-btn',
					click: function() { switchLogTab('daemons'); }
				}, '⚙️ Активные процессы nfqws2')
			]),
			// Log Console
			E('pre', {
				id: 'bcw-console-log',
				class: 'bcw-code-box',
				style: 'height: 240px; font-size: 12px; line-height: 1.4;'
			}, logsData.scanner_log || 'Ожидание вывода...')
		]);
		container.appendChild(logCard);

		function updateActiveStrategyDisplay() {
			var titleEl = document.getElementById('bcw-active-target-title');
			var metaEl = document.getElementById('bcw-active-strat-meta');
			var codeEl = document.getElementById('bcw-active-strat-code');
			if (!codeEl) return;

			var targetKey = (currentTarget === 'custom') ? 'general' : currentTarget;
			var sData = zapretServicesData[targetKey];

			var names = {
				youtube: 'YouTube (Видео/Аудио)',
				discord: 'Discord (Голос/Чат)',
				general: 'Блокированные сайты (Рутрекер, X и др.)',
				custom: 'Пользовательский домен (общие правила)'
			};

			if (titleEl) titleEl.textContent = names[currentTarget] || currentTarget;

			if (sData && sData.script && sData.script.trim() !== '') {
				var statusBadge = sData.enabled ? ' <span class="badge cbi-color-green" style="font-size: 11px;">✓ Включена</span>' : ' <span class="badge cbi-color-red" style="font-size: 11px;">✗ Отключена</span>';
				var circBadge = sData.is_circular ? ' <span class="badge cbi-color-blue" style="font-size: 11px;">🔄 Circular-связка</span>' : ' <span class="badge" style="font-size: 11px;">⚡ Одиночная</span>';
				if (metaEl) {
					metaEl.innerHTML = 'Раздел UCI: <strong>zapret2.' + sData.section + '</strong> (Порт ' + sData.port + ')' + statusBadge + circBadge;
				}
				codeEl.textContent = sData.script;
			} else {
				if (metaEl) metaEl.innerHTML = 'Раздел UCI не найден или стратегия для данного сервиса ещё не настроена.';
				codeEl.textContent = '# Стратегия пока не задана. Запустите турбо-поиск выше!';
			}
		}

		function selectTarget(target) {
			currentTarget = target;
			['youtube', 'discord', 'general', 'custom'].forEach(function(t) {
				var btn = document.getElementById('btn-target-' + t);
				if (btn) {
					if (t === target) {
						btn.classList.add('cbi-button-positive');
					} else {
						btn.classList.remove('cbi-button-positive');
					}
				}
			});
			var customRow = document.getElementById('custom-domain-row');
			if (customRow) {
				customRow.style.display = (target === 'custom' ? 'block' : 'none');
			}
			updateActiveStrategyDisplay();
		}

		function switchLogTab(tab) {
			activeLogTab = tab;
			['scanner', 'zapret2', 'daemons'].forEach(function(t) {
				var btn = document.getElementById('tab-log-' + t);
				if (btn) {
					if (t === tab) btn.classList.add('active');
					else btn.classList.remove('active');
				}
			});
			refreshLogs();
		}

		function clearLogDisplay() {
			var logEl = document.getElementById('bcw-console-log');
			if (logEl) logEl.textContent = '';
		}

		function refreshLogs() {
			return getLogs().then(function(lg) {
				var logEl = document.getElementById('bcw-console-log');
				if (!logEl) return;
				var text = '';
				if (activeLogTab === 'scanner') {
					text = lg.scanner_log || 'Лог сканера пуст. Запустите поиск.';
				} else if (activeLogTab === 'zapret2') {
					text = lg.zapret2_log || 'Лог Zapret2 пуст.';
				} else if (activeLogTab === 'daemons') {
					text = lg.daemons || 'Активные процессы nfqws2 не обнаружены.';
				}
				logEl.textContent = text;
				if (autoLogScroll) {
					logEl.scrollTop = logEl.scrollHeight;
				}
			});
		}

		function copyActiveStrategy() {
			var codeEl = document.getElementById('bcw-active-strat-code');
			if (codeEl && codeEl.textContent) {
				navigator.clipboard.writeText(codeEl.textContent).then(function() {
					ui.addNotification(null, E('p', {}, '✓ Стратегия скопирована в буфер обмена!'), 'info');
				}).catch(function() {
					ui.addNotification(null, E('p', {}, 'Выделите текст и скопируйте вручную.'), 'warning');
				});
			}
		}

		function startScan() {
			var domain = '';
			if (currentTarget === 'custom') {
				var inp = document.getElementById('custom-domain-input');
				domain = inp ? inp.value.trim() : '';
				if (!domain) {
					ui.addNotification(null, E('p', {}, 'Укажите домен для проверки!'), 'danger');
					return;
				}
			}

			var btnStart = document.getElementById('btn-start-scan');
			var btnStop = document.getElementById('btn-stop-scan');
			if (btnStart) btnStart.style.display = 'none';
			if (btnStop) btnStop.style.display = 'inline-block';

			var mon = document.getElementById('bcw-monitor-card');
			if (mon) mon.style.display = 'block';

			var circCard = document.getElementById('bcw-circular-card');
			if (circCard) circCard.style.display = 'none';

			var resCard = document.getElementById('bcw-results-card');
			if (resCard) resCard.style.display = 'none';

			var helperArgs = [
				'start',
				'--target', currentTarget,
				'--mode', currentMode,
				'--circular', doCircular ? '1' : '0',
				'--auto-apply', autoApply ? '1' : '0',
				'--workers', '2'
			];
			if (domain) {
				helperArgs.push('--domain', domain);
			}

			isRunning = true;
			fs.exec(HELPER_BIN, helperArgs).then(function() {
				startPolling();
			}).catch(function(err) {
				ui.addNotification(null, E('p', {}, 'Ошибка запуска сканера: ' + err), 'danger');
				resetScanUI();
			});
		}

		function stopScan() {
			fs.exec(HELPER_BIN, ['stop']).then(function() {
				ui.addNotification(null, E('p', {}, 'Сканирование остановлено пользователем.'), 'info');
				resetScanUI();
				refreshLogs();
			});
		}

		function resetScanUI() {
			isRunning = false;
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
			var btnStart = document.getElementById('btn-start-scan');
			var btnStop = document.getElementById('btn-stop-scan');
			if (btnStart) btnStart.style.display = 'inline-block';
			if (btnStop) btnStop.style.display = 'none';
		}

		function startPolling() {
			if (pollInterval) clearInterval(pollInterval);
			pollInterval = setInterval(function() {
				checkHelperStatus().then(function(st) {
					updateProgressUI(st);
					if (st.status === 'done' || st.status === 'idle') {
						resetScanUI();
						// Reload active strategy and logs
						getZapretInfo().then(function(info) {
							zapretServicesData = info.services || {};
							updateActiveStrategyDisplay();
						});
						refreshLogs();

						// If auto-applied, show confirmation notification
						if (st.auto_applied) {
							ui.addNotification(null, E('p', {}, '✓ Лучшая найденная стратегия автоматически применена в Zapret2 и проверена!'), 'info');
						}
					}
				});
			}, 1500);
		}

		function updateProgressUI(st) {
			var pBar = document.getElementById('bcw-progress-bar');
			var pText = document.getElementById('bcw-progress-text');
			var pPercent = document.getElementById('bcw-progress-percent');
			var pPhase = document.getElementById('bcw-progress-phase');

			if (pBar) pBar.style.width = (st.percent || 0) + '%';
			if (pPercent) pPercent.textContent = (st.percent || 0) + '%';
			if (pText) pText.textContent = st.phase || '';
			if (pPhase && st.status === 'done') pPhase.textContent = 'Сканирование завершено';

			// Live scanner log update
			if (activeLogTab === 'scanner') {
				var logEl = document.getElementById('bcw-console-log');
				if (logEl && st.log) {
					logEl.textContent = st.log;
					if (autoLogScroll) logEl.scrollTop = logEl.scrollHeight;
				}
			}

			// Circular Strategy
			if (st.circular && st.circular.trim() !== '') {
				lastCircular = st.circular;
				var circCard = document.getElementById('bcw-circular-card');
				var circCode = document.getElementById('bcw-circular-code');
				if (circCard) circCard.style.display = 'block';
				if (circCode) circCode.textContent = st.circular;
			}

			// Individual strategies
			if (st.strategies && st.strategies.length > 0) {
				lastResults = st.strategies;
				renderStrategyCards(st.strategies);
			}
		}

		function renderStrategyCards(strategies) {
			var resCard = document.getElementById('bcw-results-card');
			var list = document.getElementById('bcw-strategies-list');
			if (!list || !resCard) return;

			resCard.style.display = 'block';
			list.innerHTML = '';

			strategies.forEach(function(strat, idx) {
				var sText = (typeof strat === 'string') ? strat : (strat.args || JSON.stringify(strat));
				var card = E('div', {
					style: 'background: #252525; padding: 14px; border-radius: 6px; border: 1px solid #3c3c3c; display: flex; flex-direction: column; gap: 8px;'
				}, [
					E('div', { style: 'display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;' }, [
						E('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
							E('span', { class: 'badge cbi-color-green', style: 'font-weight: bold;' }, '#' + (idx + 1) + ' 100% Работает'),
							E('strong', { style: 'color: #61afef;' }, 'Одиночная стратегия')
						]),
						E('button', {
							class: 'cbi-button cbi-button-positive',
							style: 'padding: 4px 14px; font-weight: bold;',
							click: function() { applyStrategy(sText, false); }
						}, '✓ Применить в Zapret2')
					]),
					E('pre', {
						class: 'bcw-code-box',
						style: 'max-height: 140px;'
					}, sText)
				]);
				list.appendChild(card);
			});
		}

		function applyStrategy(scriptText, isCirc) {
			ui.showModal('Применение стратегии', [
				E('p', { class: 'spinning' }, 'Запись в конфигурацию Zapret2 и перезапуск службы...')
			]);

			fs.write('/tmp/blockcheckw_apply_temp.txt', scriptText).then(function() {
				return fs.exec(HELPER_BIN, ['apply', '--target', currentTarget, '--file', '/tmp/blockcheckw_apply_temp.txt']);
			}).then(function(res) {
				ui.hideModal();
				var parsed = null;
				try {
					parsed = JSON.parse(res.stdout);
				} catch(e) {}

				if (parsed && parsed.success) {
					var msg = isCirc ? 'Circular-связка успешно внедрена в Zapret2!' : 'Стратегия успешно внедрена в Zapret2!';
					if (parsed.connected) {
						msg += ' Соединение с сервером подтверждено (HTTP ' + parsed.http_code + ').';
					}
					ui.addNotification(null, E('p', {}, msg), 'info');
					// Reload info
					getZapretInfo().then(function(info) {
						zapretServicesData = info.services || {};
						updateActiveStrategyDisplay();
						var badge = document.getElementById('bcw-zapret-badge');
						if (badge) {
							badge.className = (info.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red';
							badge.textContent = (info.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен';
						}
					});
					refreshLogs();
				} else {
					ui.addNotification(null, E('p', {}, 'Ошибка применения: ' + (parsed ? parsed.error : res.stderr)), 'danger');
				}
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, 'Ошибка применения: ' + err), 'danger');
			});
		}

		function testActiveConnection() {
			var url = 'https://rutracker.org';
			if (currentTarget === 'youtube') url = 'https://googlevideo.com';
			else if (currentTarget === 'discord') url = 'https://gateway.discord.gg';
			else if (currentTarget === 'custom') {
				var inp = document.getElementById('custom-domain-input');
				var d = inp ? inp.value.trim() : '';
				if (d) url = 'https://' + d;
			}

			ui.showModal('Проверка доступности', [
				E('p', { class: 'spinning' }, 'Отправка проверочного запроса к ' + url + '...')
			]);

			fs.exec(HELPER_BIN, ['test', url]).then(function(res) {
				ui.hideModal();
				var parsed = null;
				try { parsed = JSON.parse(res.stdout); } catch(e) {}
				if (parsed && parsed.accessible) {
					ui.addNotification(null, E('p', {}, '✓ Ресурс доступен! Ответ HTTP ' + parsed.http_code), 'info');
				} else {
					ui.addNotification(null, E('p', {}, '✗ Ресурс не отвечает через текущую стратегию Zapret2 (код ' + (parsed ? parsed.http_code : 0) + '). Запустите подбор стратегий!'), 'warning');
				}
			}).catch(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, 'Не удалось выполнить проверку.'), 'danger');
			});
		}

		// Initial display
		updateActiveStrategyDisplay();

		// Periodic background log refresher if log viewer is open
		logPollInterval = setInterval(function() {
			if (!isRunning) {
				refreshLogs();
			}
		}, 5000);

		// Initial status check if already running
		if (statusData.status === 'running') {
			var mon = document.getElementById('bcw-monitor-card');
			if (mon) mon.style.display = 'block';
			var btnStart = document.getElementById('btn-start-scan');
			var btnStop = document.getElementById('btn-stop-scan');
			if (btnStart) btnStart.style.display = 'none';
			if (btnStop) btnStop.style.display = 'inline-block';
			updateProgressUI(statusData);
			startPolling();
		}

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
