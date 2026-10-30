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
		var statusData = data[0] || {};
		var zapretInfo = data[1] || {};
		var logsData = data[2] || {};
		zapretServicesData = zapretInfo.services || {};

		var container = E('div', { class: 'cbi-map bcw-wrapper' });

		// Inject Scoped Styles for Clean, High-Contrast UI
		var styleSheet = E('style', {}, [
			'/* BlockcheckW Unified Dashboard Styles */\n' +
			'.bcw-wrapper * { box-sizing: border-box; }\n' +
			'.bcw-container { display: flex; flex-direction: column; gap: 18px; margin-top: 8px; }\n' +
			'.bcw-card { background: #20232a; border: 1px solid #323742; border-radius: 8px; padding: 18px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }\n' +
			'.bcw-card-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }\n' +
			'.bcw-card-title { font-size: 15px; font-weight: bold; margin: 0; display: flex; align-items: center; gap: 8px; color: #e5e9f0; }\n' +
			'\n' +
			'/* Target Selection Grid */\n' +
			'.bcw-target-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }\n' +
			'.bcw-target-btn { background: #282c34; border: 2px solid #3e4451; border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; text-align: left; }\n' +
			'.bcw-target-btn:hover { border-color: #3273dc; background: #2f343e; transform: translateY(-1px); }\n' +
			'.bcw-target-btn.active { border-color: #00d1b2 !important; background: rgba(0, 209, 178, 0.1) !important; box-shadow: 0 0 12px rgba(0, 209, 178, 0.25); }\n' +
			'.bcw-target-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }\n' +
			'.bcw-target-title { font-size: 15px; font-weight: bold; display: flex; align-items: center; gap: 6px; }\n' +
			'.bcw-target-desc { font-size: 12px; opacity: 0.75; line-height: 1.35; margin: 0; }\n' +
			'\n' +
			'/* Control & Parameters Bar */\n' +
			'.bcw-control-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 18px; }\n' +
			'.bcw-param-box { background: #282c34; border: 1px solid #383e4a; border-radius: 6px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; }\n' +
			'.bcw-param-label { font-size: 13px; font-weight: bold; color: #abb2bf; }\n' +
			'.bcw-segmented { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid #485060; background: #1c1f24; }\n' +
			'.bcw-seg-btn { flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer; background: transparent; border: none; color: #828997; transition: all 0.2s; }\n' +
			'.bcw-seg-btn:hover { color: #fff; background: rgba(255,255,255,0.06); }\n' +
			'.bcw-seg-btn.active { background: #3273dc; color: #fff; font-weight: bold; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }\n' +
			'.bcw-seg-btn.active.teal { background: #00d1b2; color: #000; font-weight: bold; }\n' +
			'\n' +
			'/* Main Unified Action Bar */\n' +
			'.bcw-action-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding-top: 4px; }\n' +
			'.bcw-btn-launch { padding: 12px 28px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: none; background: #00d1b2; color: #000; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,209,178,0.25); }\n' +
			'.bcw-btn-launch:hover { background: #00e6c4; box-shadow: 0 0 16px rgba(0,209,178,0.45); transform: translateY(-1px); }\n' +
			'.bcw-btn-stop { padding: 12px 28px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: none; background: #ff3860; color: #fff; transition: all 0.2s; }\n' +
			'.bcw-btn-stop:hover { background: #ff4d73; box-shadow: 0 0 14px rgba(255,56,96,0.4); }\n' +
			'.bcw-btn-secondary { padding: 11px 20px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #485060; background: #282c34; color: #abb2bf; transition: all 0.2s; }\n' +
			'.bcw-btn-secondary:hover { background: #323742; color: #fff; border-color: #3273dc; }\n' +
			'\n' +
			'/* Code and Console Boxes */\n' +
			'.bcw-code-box { box-sizing: border-box; background: #181a1f; color: #98c379; padding: 14px 16px; border-radius: 6px; font-size: 12px; font-family: "SF Mono", "Consolas", "Courier New", monospace; line-height: 1.45; white-space: pre-wrap; word-break: break-all; margin: 0; max-height: 250px; overflow-y: auto; border: 1px solid #282c34; }\n' +
			'.bcw-log-tabs { display: flex; flex-wrap: wrap; gap: 8px; }\n' +
			'.bcw-log-tab-btn { padding: 6px 14px; font-size: 12px; font-weight: 500; cursor: pointer; border-radius: 4px; border: 1px solid #3e4451; background: #282c34; color: #abb2bf; transition: all 0.2s; }\n' +
			'.bcw-log-tab-btn.active { background: #3273dc; color: #fff; border-color: #3273dc; font-weight: bold; }\n' +
			'\n' +
			'/* Responsive */\n' +
			'@media (max-width: 900px) {\n' +
			'  .bcw-target-grid { grid-template-columns: repeat(2, 1fr); }\n' +
			'  .bcw-control-grid { grid-template-columns: 1fr; }\n' +
			'  .bcw-action-bar { flex-direction: column; width: 100%; }\n' +
			'  .bcw-action-bar button { width: 100%; justify-content: center; }\n' +
			'}\n' +
			'@media (max-width: 520px) {\n' +
			'  .bcw-target-grid { grid-template-columns: 1fr; }\n' +
			'}\n'
		]);
		container.appendChild(styleSheet);

		// Layout Wrapper
		var mainLayout = E('div', { class: 'bcw-container' });
		container.appendChild(mainLayout);

		// Header Section
		var zapretBadgeEl = E('span', {
			class: (zapretInfo.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red',
			style: 'font-size: 13px; font-weight: bold; padding: 6px 14px; border-radius: 6px;'
		}, (zapretInfo.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен');

		var headerCard = E('div', { class: 'bcw-card', style: 'padding: 16px 20px;' }, [
			E('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;' }, [
				E('div', {}, [
					E('h2', { style: 'margin: 0; font-size: 21px; display: flex; align-items: center; gap: 8px;' }, [
						'⚡ BlockcheckW — Поиск стратегий Zapret2'
					]),
					E('div', { style: 'font-size: 13px; opacity: 0.8; margin-top: 4px;' }, [
						'Быстрый подбор рабочих параметров DPI для роутера, сборка отказоустойчивых Circular-связок и внедрение в 1 клик.'
					])
				]),
				zapretBadgeEl
			])
		]);
		mainLayout.appendChild(headerCard);

		// Target Selection Card
		var targetCardsMap = {};
		var targetBadgesMap = {};
		var targetDefs = [
			{ id: 'youtube', name: 'YouTube', icon: '📺', desc: 'Превью, 1080p/4K стримы (googlevideo)', key: 'youtube' },
			{ id: 'discord', name: 'Discord', icon: '💬', desc: 'Голосовые каналы, шлюзы, чат', key: 'discord' },
			{ id: 'general', name: 'Блокированные сайты', icon: '🌐', desc: 'Рутрекер, X/Twitter, Instagram, ntc.party', key: 'general' },
			{ id: 'custom', name: 'Свой домен', icon: '🎯', desc: 'Произвольный ресурс для проверки обхода', key: 'general' }
		];

		var targetGridEl = E('div', { class: 'bcw-target-grid' });
		targetDefs.forEach(function(t) {
			var svc = zapretServicesData[t.key] || {};
			var badgeText = 'Не настроено';
			var badgeClass = 'badge cbi-color-neutral';
			if (svc.enabled) {
				badgeText = svc.is_circular ? '🔄 Circular' : '✓ Включено';
				badgeClass = svc.is_circular ? 'badge cbi-color-blue' : 'badge cbi-color-green';
			}

			var bEl = E('span', { class: badgeClass, style: 'font-size: 11px; padding: 2px 8px;' }, badgeText);
			targetBadgesMap[t.id] = bEl;

			var card = E('div', {
				class: 'bcw-target-btn' + (currentTarget === t.id ? ' active' : ''),
				click: function() { selectTarget(t.id); }
			}, [
				E('div', { class: 'bcw-target-top' }, [
					E('div', { class: 'bcw-target-title' }, [ t.icon + ' ' + t.name ]),
					bEl
				]),
				E('p', { class: 'bcw-target-desc' }, t.desc)
			]);

			targetCardsMap[t.id] = card;
			targetGridEl.appendChild(card);
		});

		var customDomainInput = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			placeholder: 'rutracker.org',
			style: 'width: 320px; max-width: 100%; font-size: 14px; padding: 6px 10px;'
		});

		var customDomainRow = E('div', {
			style: (currentTarget === 'custom' ? 'display: block; margin-top: 14px;' : 'display: none; margin-top: 14px;')
		}, [
			E('label', { style: 'font-weight: bold; margin-right: 10px;' }, 'Домен для сканирования:'),
			customDomainInput
		]);

		var targetSectionCard = E('div', { class: 'bcw-card' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, '1. Выберите цель обхода')
			]),
			targetGridEl,
			customDomainRow
		]);
		mainLayout.appendChild(targetSectionCard);

		// Parameters and Launch Control Card
		var btnModeTurbo = E('button', {
			class: 'bcw-seg-btn' + (currentMode === 'turbo' ? ' active' : ''),
			click: function() { switchMode('turbo'); }
		}, '⚡ Турбо (10-15 сек)');

		var btnModeFull = E('button', {
			class: 'bcw-seg-btn' + (currentMode === 'full' ? ' active' : ''),
			click: function() { switchMode('full'); }
		}, '🔬 Глубокий скан');

		var btnApplyAuto = E('button', {
			class: 'bcw-seg-btn' + (autoApply ? ' active teal' : ''),
			click: function() { switchApplyMode(true); }
		}, '⚡ Авто (Auto-Apply)');

		var btnApplyManual = E('button', {
			class: 'bcw-seg-btn' + (!autoApply ? ' active' : ''),
			click: function() { switchApplyMode(false); }
		}, '✋ Вручную (По кнопке)');

		var chkCircular = E('input', {
			type: 'checkbox',
			checked: doCircular,
			style: 'margin-right: 8px; cursor: pointer;',
			change: function(e) { doCircular = e.target.checked; }
		});

		var btnStartScan = E('button', {
			class: 'bcw-btn-launch',
			click: function() { startScan(); }
		}, '▶ Запустить поиск стратегий');

		var btnStopScan = E('button', {
			class: 'bcw-btn-stop',
			style: 'display: none;',
			click: function() { stopScan(); }
		}, '⏹ Остановить сканирование');

		var btnTestConn = E('button', {
			class: 'bcw-btn-secondary',
			click: function() { testActiveConnection(); }
		}, '🌐 Проверить доступность (curl)');

		var controlCard = E('div', { class: 'bcw-card' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, '2. Параметры поиска и запуск')
			]),
			E('div', { class: 'bcw-control-grid' }, [
				// Box 1: Mode
				E('div', { class: 'bcw-param-box' }, [
					E('div', { class: 'bcw-param-label' }, 'Скорость подбора:'),
					E('div', { class: 'bcw-segmented' }, [ btnModeTurbo, btnModeFull ]),
					E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Турбо тестирует топ-пресеты 2026 года.')
				]),
				// Box 2: Auto-apply
				E('div', { class: 'bcw-param-box' }, [
					E('div', { class: 'bcw-param-label' }, 'Режим применения:'),
					E('div', { class: 'bcw-segmented' }, [ btnApplyAuto, btnApplyManual ]),
					E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Авто сразу внедряет лучшую связку в Zapret2.')
				]),
				// Box 3: Circular
				E('div', { class: 'bcw-param-box' }, [
					E('div', { class: 'bcw-param-label' }, 'Отказоустойчивость:'),
					E('label', { style: 'display: flex; align-items: center; cursor: pointer; font-size: 13px; font-weight: 600;' }, [
						chkCircular,
						E('span', { style: 'color: #3273dc;' }, '🔄 Circular авто-ротация')
					]),
					E('div', { style: 'font-size: 11px; opacity: 0.7;' }, 'Ротация между разными техниками обхода.')
				])
			]),
			E('div', { class: 'bcw-action-bar' }, [
				btnStartScan,
				btnStopScan,
				btnTestConn
			])
		]);
		mainLayout.appendChild(controlCard);

		// Active Strategy Inspector Card
		var activeTargetTitleEl = E('span', { style: 'color: #3273dc; font-weight: bold;' }, 'YouTube');
		var activeMetaBadgesEl = E('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px; align-items: center;' }, '');
		var activeCodeEl = E('pre', { class: 'bcw-code-box', style: 'max-height: 220px;' }, '');

		var btnCopyActive = E('button', {
			class: 'cbi-button cbi-button-neutral',
			style: 'padding: 4px 12px; font-size: 12px;',
			click: function() { copyActiveStrategy(); }
		}, '📋 Скопировать');

		var activeStratCard = E('div', { class: 'bcw-card', style: 'border-left: 4px solid #3273dc;' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, [
					'🛡️ Активная стратегия в Zapret2: ',
					activeTargetTitleEl
				]),
				E('div', { style: 'display: flex; gap: 8px; align-items: center;' }, [
					btnCopyActive
				])
			]),
			activeMetaBadgesEl,
			activeCodeEl
		]);
		mainLayout.appendChild(activeStratCard);

		// Progress Monitor Card (Hidden when idle)
		var progressBarEl = E('div', {
			style: 'background: linear-gradient(90deg, #3273dc, #00d1b2); height: 100%; width: 0%; transition: width 0.3s ease;'
		});
		var progressTextEl = E('span', {}, 'Инициализация...');
		var progressPercentEl = E('span', { style: 'font-weight: bold;' }, '0%');
		var progressPhaseEl = E('h3', { class: 'bcw-card-title', style: 'color: #00d1b2;' }, 'Прогресс сканирования');

		var monitorCard = E('div', { class: 'bcw-card', style: 'display: none; border-left: 4px solid #00d1b2;' }, [
			E('div', { class: 'bcw-card-header' }, [
				progressPhaseEl
			]),
			E('div', { style: 'background: #181a1f; border-radius: 8px; height: 20px; width: 100%; overflow: hidden; margin: 10px 0; border: 1px solid #383e4a;' }, [
				progressBarEl
			]),
			E('div', { style: 'display: flex; justify-content: space-between; font-size: 13px; opacity: 0.9;' }, [
				progressTextEl,
				progressPercentEl
			])
		]);
		mainLayout.appendChild(monitorCard);

		// Circular Strategy Result Card
		var circularCodeEl = E('pre', { class: 'bcw-code-box', style: 'color: #98c379; max-height: 220px;' }, '');
		var btnApplyCircular = E('button', {
			class: 'cbi-button cbi-button-positive',
			style: 'padding: 8px 18px; font-weight: bold; font-size: 14px;',
			click: function() { applyStrategy(lastCircular, true); }
		}, '✓ Применить Circular-связку в Zapret2');

		var circularCard = E('div', { class: 'bcw-card', style: 'display: none; border: 2px solid #00d1b2; background: rgba(0, 209, 178, 0.04);' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title', style: 'color: #00d1b2;' }, [
					'🛡️ Собрана Circular-связка Zapret2',
					E('span', { class: 'badge cbi-color-green', style: 'font-size: 11px; margin-left: 8px;' }, 'Авто-ротация')
				]),
				btnApplyCircular
			]),
			E('div', { style: 'font-size: 13px; margin-bottom: 10px; opacity: 0.9;' }, [
				'Связка объединяет независимые техники обхода (Fake ClientHello, Multisplit, Multidisorder). При сбое одной стратегии Zapret2 автоматически переключается на следующую за 20 секунд!'
			]),
			circularCodeEl
		]);
		mainLayout.appendChild(circularCard);

		// Individual Working Strategies Section
		var strategiesListEl = E('div', { style: 'display: flex; flex-direction: column; gap: 12px; margin-top: 10px;' });
		var resultsCard = E('div', { class: 'bcw-card', style: 'display: none;' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, 'Найденные рабочие стратегии (100% проверено)')
			]),
			strategiesListEl
		]);
		mainLayout.appendChild(resultsCard);

		// Live Logs and Diagnostics Monitor Card
		var consoleLogEl = E('pre', {
			class: 'bcw-code-box',
			style: 'height: 230px; font-size: 12px; line-height: 1.45; background: #14161a;'
		}, logsData.scanner_log || 'Ожидание запуска сканера...');

		var chkAutoScroll = E('input', {
			type: 'checkbox',
			checked: autoLogScroll,
			style: 'cursor: pointer;',
			change: function(e) { autoLogScroll = e.target.checked; }
		});

		var logTabButtons = {};
		var logTabs = [
			{ id: 'scanner', title: '⚡ Лог BlockcheckW' },
			{ id: 'zapret2', title: '🛡️ Системный лог Zapret2' },
			{ id: 'daemons', title: '⚙️ Демоны nfqws2' }
		];

		var logTabsBar = E('div', { class: 'bcw-log-tabs' });
		logTabs.forEach(function(tb) {
			var btn = E('button', {
				class: 'bcw-log-tab-btn' + (activeLogTab === tb.id ? ' active' : ''),
				click: function() { switchLogTab(tb.id); }
			}, tb.title);
			logTabButtons[tb.id] = btn;
			logTabsBar.appendChild(btn);
		});

		var logCard = E('div', { class: 'bcw-card' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, '📋 Мониторинг и логи службы'),
				E('div', { style: 'display: flex; flex-wrap: wrap; gap: 10px; align-items: center;' }, [
					E('label', { style: 'font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;' }, [
						chkAutoScroll,
						E('span', {}, 'Автоскролл')
					]),
					E('button', {
						class: 'cbi-button cbi-button-neutral',
						style: 'padding: 4px 10px; font-size: 12px;',
						click: function() { refreshLogs(); }
					}, '🔄 Обновить'),
					E('button', {
						class: 'cbi-button cbi-button-reset',
						style: 'padding: 4px 10px; font-size: 12px;',
						click: function() { consoleLogEl.textContent = ''; }
					}, '🗑 Очистить')
				])
			]),
			logTabsBar,
			E('div', { style: 'margin-top: 10px;' }, [ consoleLogEl ])
		]);
		mainLayout.appendChild(logCard);

		// Business Logic Functions

		function updateActiveStrategyDisplay() {
			var targetKey = (currentTarget === 'custom') ? 'general' : currentTarget;
			var sData = zapretServicesData[targetKey];

			var names = {
				youtube: 'YouTube (Видео/Аудио)',
				discord: 'Discord (Голос/Чат)',
				general: 'Блокированные сайты (Рутрекер, X и др.)',
				custom: 'Пользовательский домен (общие правила)'
			};

			activeTargetTitleEl.textContent = names[currentTarget] || currentTarget;
			activeMetaBadgesEl.innerHTML = '';

			if (sData && sData.script && sData.script.trim() !== '') {
				var secBadge = E('span', { class: 'badge', style: 'background: #3e4451; color: #fff; font-size: 11px;' }, 'Раздел: zapret2.' + sData.section);
				var portBadge = E('span', { class: 'badge', style: 'background: #3e4451; color: #fff; font-size: 11px;' }, 'Порт: ' + sData.port);
				var statusBadge = sData.enabled ?
					E('span', { class: 'badge cbi-color-green', style: 'font-size: 11px;' }, '✓ Включена') :
					E('span', { class: 'badge cbi-color-red', style: 'font-size: 11px;' }, '✗ Отключена');
				var circBadge = sData.is_circular ?
					E('span', { class: 'badge cbi-color-blue', style: 'font-size: 11px;' }, '🔄 Circular-связка') :
					E('span', { class: 'badge', style: 'background: #485060; color: #fff; font-size: 11px;' }, '⚡ Одиночная');

				activeMetaBadgesEl.appendChild(secBadge);
				activeMetaBadgesEl.appendChild(portBadge);
				activeMetaBadgesEl.appendChild(statusBadge);
				activeMetaBadgesEl.appendChild(circBadge);

				activeCodeEl.textContent = sData.script;
			} else {
				activeMetaBadgesEl.appendChild(
					E('span', { class: 'badge cbi-color-neutral', style: 'font-size: 11px;' }, 'Стратегия не настроена')
				);
				activeCodeEl.textContent = '# Стратегия для данного сервиса ещё не задана в Zapret2.\n# Запустите турбо-поиск выше, чтобы подобрать и применить рабочую стратегию!';
			}
		}

		function selectTarget(targetId) {
			currentTarget = targetId;
			targetDefs.forEach(function(t) {
				var btn = targetCardsMap[t.id];
				if (btn) {
					if (t.id === targetId) btn.classList.add('active');
					else btn.classList.remove('active');
				}
			});
			customDomainRow.style.display = (targetId === 'custom' ? 'block' : 'none');
			updateActiveStrategyDisplay();
		}

		function switchMode(mode) {
			currentMode = mode;
			if (mode === 'turbo') {
				btnModeTurbo.classList.add('active');
				btnModeFull.classList.remove('active');
			} else {
				btnModeFull.classList.add('active');
				btnModeTurbo.classList.remove('active');
			}
		}

		function switchApplyMode(isAuto) {
			autoApply = isAuto;
			if (isAuto) {
				btnApplyAuto.classList.add('active', 'teal');
				btnApplyManual.classList.remove('active');
			} else {
				btnApplyManual.classList.add('active');
				btnApplyAuto.classList.remove('active', 'teal');
			}
		}

		function switchLogTab(tabId) {
			activeLogTab = tabId;
			logTabs.forEach(function(tb) {
				var b = logTabButtons[tb.id];
				if (b) {
					if (tb.id === tabId) b.classList.add('active');
					else b.classList.remove('active');
				}
			});
			refreshLogs();
		}

		function refreshLogs() {
			return getLogs().then(function(lg) {
				var text = '';
				if (activeLogTab === 'scanner') {
					text = lg.scanner_log || 'Лог сканера пуст. Запустите поиск.';
				} else if (activeLogTab === 'zapret2') {
					text = lg.zapret2_log || 'Лог Zapret2 пуст.';
				} else if (activeLogTab === 'daemons') {
					text = lg.daemons || 'Активные процессы nfqws2 не обнаружены.';
				}
				consoleLogEl.textContent = text;
				if (autoLogScroll) {
					consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
				}
			});
		}

		function copyActiveStrategy() {
			if (activeCodeEl && activeCodeEl.textContent) {
				navigator.clipboard.writeText(activeCodeEl.textContent).then(function() {
					ui.addNotification(null, E('p', {}, '✓ Стратегия скопирована в буфер обмена!'), 'info');
				}).catch(function() {
					ui.addNotification(null, E('p', {}, 'Выделите текст и скопируйте вручную.'), 'warning');
				});
			}
		}

		function startScan() {
			var domain = '';
			if (currentTarget === 'custom') {
				domain = customDomainInput.value.trim();
				if (!domain) {
					ui.addNotification(null, E('p', {}, 'Пожалуйста, укажите домен для проверки!'), 'danger');
					return;
				}
			}

			btnStartScan.style.display = 'none';
			btnStopScan.style.display = 'inline-flex';
			monitorCard.style.display = 'block';
			circularCard.style.display = 'none';
			resultsCard.style.display = 'none';

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
			btnStartScan.style.display = 'inline-flex';
			btnStopScan.style.display = 'none';
		}

		function startPolling() {
			if (pollInterval) clearInterval(pollInterval);
			pollInterval = setInterval(function() {
				checkHelperStatus().then(function(st) {
					updateProgressUI(st);
					if (st.status === 'done' || st.status === 'idle') {
						resetScanUI();
						getZapretInfo().then(function(info) {
							zapretServicesData = info.services || {};
							updateActiveStrategyDisplay();
							updateTargetBadges();
						});
						refreshLogs();

						if (st.auto_applied) {
							ui.addNotification(null, E('p', {}, '✓ Лучшая найденная стратегия автоматически применена в Zapret2 и проверена!'), 'info');
						}
					}
				});
			}, 1500);
		}

		function updateTargetBadges() {
			targetDefs.forEach(function(t) {
				var bEl = targetBadgesMap[t.id];
				var svc = zapretServicesData[t.key] || {};
				if (bEl) {
					if (svc.enabled) {
						bEl.textContent = svc.is_circular ? '🔄 Circular' : '✓ Включено';
						bEl.className = svc.is_circular ? 'badge cbi-color-blue' : 'badge cbi-color-green';
					} else {
						bEl.textContent = 'Не настроено';
						bEl.className = 'badge cbi-color-neutral';
					}
				}
			});
		}

		function updateProgressUI(st) {
			progressBarEl.style.width = (st.percent || 0) + '%';
			progressPercentEl.textContent = (st.percent || 0) + '%';
			progressTextEl.textContent = st.phase || '';
			if (st.status === 'done') progressPhaseEl.textContent = 'Сканирование завершено';

			if (activeLogTab === 'scanner' && st.log) {
				consoleLogEl.textContent = st.log;
				if (autoLogScroll) consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
			}

			if (st.circular && st.circular.trim() !== '') {
				lastCircular = st.circular;
				circularCard.style.display = 'block';
				circularCodeEl.textContent = st.circular;
			}

			if (st.strategies && st.strategies.length > 0) {
				lastResults = st.strategies;
				renderStrategyCards(st.strategies);
			}
		}

		function renderStrategyCards(strategies) {
			resultsCard.style.display = 'block';
			strategiesListEl.innerHTML = '';

			strategies.forEach(function(strat, idx) {
				var sText = (typeof strat === 'string') ? strat : (strat.args || JSON.stringify(strat));
				var card = E('div', {
					style: 'background: #282c34; padding: 14px; border-radius: 6px; border: 1px solid #3e4451; display: flex; flex-direction: column; gap: 8px;'
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
				strategiesListEl.appendChild(card);
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
					getZapretInfo().then(function(info) {
						zapretServicesData = info.services || {};
						updateActiveStrategyDisplay();
						updateTargetBadges();
						if (zapretBadgeEl) {
							zapretBadgeEl.className = (info.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red';
							zapretBadgeEl.textContent = (info.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен';
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
				var d = customDomainInput.value.trim();
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

		// Initial Direct Update before DOM Mount
		updateActiveStrategyDisplay();

		// Periodic background log refresher
		logPollInterval = setInterval(function() {
			if (!isRunning) {
				refreshLogs();
			}
		}, 5000);

		// Initial check if background scan is already running
		if (statusData.status === 'running') {
			monitorCard.style.display = 'block';
			btnStartScan.style.display = 'none';
			btnStopScan.style.display = 'inline-flex';
			updateProgressUI(statusData);
			startPolling();
		}

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
