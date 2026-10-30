'use strict';
'require view';
'require fs';
'require ui';

var HELPER_BIN = '/usr/bin/blockcheckw-helper';
var isRunning = false;
var pollInterval = null;
var logPollInterval = null;
var currentTarget = 'preset_youtube';
var currentMode = 'turbo';
var doCircular = true;
var autoApply = true;
var activeLogTab = 'scanner';
var autoLogScroll = true;
var lastResults = [];
var lastCircular = '';
var zapretServicesData = {};
var zapretAllStrategies = [];

var PRESET_DEFS = {
	'builtin': {
		name: 'Встроенные хосты (33)',
		label: 'Встроенные хосты (33)',
		icon: '🌐',
		domain: 'rutracker.org',
		domainsText: '33 хоста, 17 провайдеров (Rutracker, Pornhub, TorProject, BBC и др.)',
		test_url: 'https://rutracker.org',
		key: 'builtin',
		port: '80,443'
	},
	'preset_youtube': {
		name: 'Предустановленный список YouTube (3)',
		label: 'YouTube (3)',
		icon: '📺',
		domain: 'www.youtube.com',
		domainsText: 'googlevideo.com (видеопотоки), i.ytimg.com (превью), youtube.com',
		test_url: 'https://www.youtube.com',
		key: 'preset_youtube',
		port: '443'
	},
	'preset_discord': {
		name: 'Предустановленный список Discord (3)',
		label: 'Discord (3)',
		icon: '💬',
		domain: 'gateway.discord.gg',
		domainsText: 'gateway.discord.gg (голос), discord.com, cdn.discordapp.com',
		test_url: 'https://gateway.discord.gg',
		key: 'preset_discord',
		port: '443'
	},
	'preset_twitch': {
		name: 'Предустановленный список Twitch (3)',
		label: 'Twitch (3)',
		icon: '🎮',
		domain: 'twitch.tv',
		domainsText: 'twitch.tv, static-cdn.jtvnw.net, usher.ttvnw.net (стримы)',
		test_url: 'https://twitch.tv',
		key: 'preset_twitch',
		port: '443'
	},
	'preset_x': {
		name: 'Предустановленный список X (3)',
		label: 'X / Twitter (3)',
		icon: '🐦',
		domain: 'x.com',
		domainsText: 'x.com, api.x.com, pbs.twimg.com (медиа)',
		test_url: 'https://x.com',
		key: 'preset_x',
		port: '443'
	},
	'preset_instagram': {
		name: 'Предустановленный список Instagram (2)',
		label: 'Instagram (2)',
		icon: '📸',
		domain: 'gateway.instagram.com',
		domainsText: 'gateway.instagram.com, static.cdninstagram.com',
		test_url: 'https://gateway.instagram.com',
		key: 'preset_instagram',
		port: '443'
	},
	'tcp16': {
		name: 'Кандидаты TCP 16-20 KB (110)',
		label: 'TCP 16-20 KB (110)',
		icon: '⚡',
		domain: 'media.miele.com',
		domainsText: '110 хостов из suite.json (Miele, Roxio, GetScope и др.)',
		test_url: 'https://media.miele.com',
		key: 'tcp16',
		port: '443'
	},
	'domains': {
		name: 'Свои домены',
		label: 'Свои домены',
		icon: '🎯',
		domain: 'rutracker.org',
		domainsText: 'Пользовательский список доменов для поиска обхода',
		test_url: 'https://rutracker.org',
		key: 'domains',
		port: '80,443'
	},
	'test_strategy': {
		name: 'Тест стратегии',
		label: 'Тест стратегии',
		icon: '🧪',
		domain: 'rutracker.org',
		domainsText: 'Проверка работы существующей стратегии Zapret2 на ресурсе',
		test_url: 'https://rutracker.org',
		key: 'test_strategy',
		port: '443'
	}
};

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
		return { zapret2_running: 'unknown', services: {}, all_strategies: [] };
	}).catch(function() {
		return { zapret2_running: 'unknown', services: {}, all_strategies: [] };
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

function checkVersion() {
	return fs.exec(HELPER_BIN, ['check_update']).then(function(res) {
		if (res && res.code === 0 && res.stdout) {
			try {
				return JSON.parse(res.stdout);
			} catch (e) {}
		}
		return { success: false, current_version: '1.3.0', has_update: false };
	}).catch(function() {
		return { success: false, current_version: '1.3.0', has_update: false };
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			checkHelperStatus(),
			getZapretInfo(),
			getLogs(),
			checkVersion()
		]);
	},

	render: function(data) {
		var statusData = data[0] || {};
		var zapretInfo = data[1] || {};
		var logsData = data[2] || {};
		var versionInfo = data[3] || { current_version: '1.3.0', has_update: false };
		zapretServicesData = zapretInfo.services || {};
		zapretAllStrategies = zapretInfo.all_strategies || [];

		var container = E('div', { class: 'cbi-map bcw-wrapper' });

		// Scoped Styles
		var styleSheet = E('style', {}, [
			'/* BlockcheckW Unified Dashboard Styles */\n' +
			'.bcw-wrapper * { box-sizing: border-box; }\n' +
			'.bcw-container { display: flex; flex-direction: column; gap: 18px; margin-top: 8px; }\n' +
			'.bcw-card { background: #20232a; border: 1px solid #323742; border-radius: 8px; padding: 18px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }\n' +
			'.bcw-card-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }\n' +
			'.bcw-card-title { font-size: 15px; font-weight: bold; margin: 0; display: flex; align-items: center; gap: 8px; color: #e5e9f0; }\n' +
			'\n' +
			'/* Finder Mode Dropdown & Chips */\n' +
			'.bcw-mode-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }\n' +
			'.bcw-select { box-sizing: border-box; min-width: 320px; max-width: 100%; padding: 8px 14px; font-size: 14px; font-weight: 600; border-radius: 6px; background: #282c34; color: #fff; border: 1px solid #485060; outline: none; cursor: pointer; transition: all 0.2s; }\n' +
			'.bcw-select:hover, .bcw-select:focus { border-color: #3273dc; box-shadow: 0 0 8px rgba(50, 115, 220, 0.3); }\n' +
			'.bcw-chips-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }\n' +
			'.bcw-chip-btn { box-sizing: border-box; padding: 6px 14px; font-size: 12px; font-weight: 500; border-radius: 20px; cursor: pointer; background: #282c34; border: 1px solid #3e4451; color: #abb2bf; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }\n' +
			'.bcw-chip-btn:hover { color: #fff; border-color: #3273dc; background: #323742; }\n' +
			'.bcw-chip-btn.active { background: rgba(0, 209, 178, 0.15); border-color: #00d1b2; color: #00d1b2; font-weight: bold; }\n' +
			'.bcw-target-summary { margin-top: 14px; padding: 12px 14px; border-radius: 6px; background: rgba(255,255,255,0.03); border: 1px solid #383e4a; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }\n' +
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
			'  .bcw-control-grid { grid-template-columns: 1fr; }\n' +
			'  .bcw-action-bar { flex-direction: column; width: 100%; }\n' +
			'  .bcw-action-bar button { width: 100%; justify-content: center; }\n' +
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

		var versionBadgeEl = E('span', {
			class: 'badge',
			style: 'font-size: 13px; font-weight: bold; padding: 6px 12px; border-radius: 6px; background: #282c34; border: 1px solid #485060; color: #abb2bf;'
		}, 'v' + (versionInfo.current_version || '1.3.0'));

		var btnCheckUpdate = E('button', {
			class: 'bcw-btn-secondary',
			style: 'padding: 6px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;',
			click: function() { doCheckUpdate(true); }
		}, [
			E('span', {}, '🔄'),
			'Проверить обновление'
		]);

		var btnFeedback = E('a', {
			class: 'bcw-btn-secondary',
			style: 'padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;',
			href: 'https://github.com/prostoy23rus/blockcheckw/issues',
			target: '_blank',
			title: 'Сообщить об ошибке или предложить улучшение на GitHub'
		}, [
			E('span', {}, '💬'),
			'Баг-репорты / Идеи'
		]);

		var headerRightActions = E('div', {
			style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;'
		}, [
			versionBadgeEl,
			btnCheckUpdate,
			btnFeedback,
			zapretBadgeEl
		]);

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
				headerRightActions
			])
		]);
		mainLayout.appendChild(headerCard);

		// Update Notification Banner (Dynamic)
		var updateBannerCard = E('div', {
			class: 'bcw-card',
			style: 'padding: 14px 20px; background: rgba(0, 209, 178, 0.08); border: 1px solid #00d1b2; display: none;'
		});
		mainLayout.appendChild(updateBannerCard);

		// Target Selection Section (Zapret Finder Style Dropdown + Quick Chips)
		var modeSelectEl = E('select', {
			class: 'bcw-select',
			change: function(e) { selectTarget(e.target.value); }
		}, [
			E('option', { value: 'builtin' }, 'Встроенные хосты (33)'),
			E('option', { value: 'preset_youtube', selected: 'selected' }, 'Предустановленный список YouTube (3)'),
			E('option', { value: 'preset_discord' }, 'Предустановленный список Discord (3)'),
			E('option', { value: 'preset_twitch' }, 'Предустановленный список Twitch (3)'),
			E('option', { value: 'preset_x' }, 'Предустановленный список X (3)'),
			E('option', { value: 'preset_instagram' }, 'Предустановленный список Instagram (2)'),
			E('option', { value: 'tcp16' }, 'Кандидаты TCP 16-20 KB (110)'),
			E('option', { value: 'domains' }, 'Свои домены'),
			E('option', { value: 'test_strategy' }, 'Тест стратегии')
		]);

		var chipButtonsMap = {};
		var quickChipsList = [
			{ id: 'preset_youtube', icon: '📺', name: 'YouTube' },
			{ id: 'preset_discord', icon: '💬', name: 'Discord' },
			{ id: 'preset_twitch', icon: '🎮', name: 'Twitch' },
			{ id: 'preset_x', icon: '🐦', name: 'X / Twitter' },
			{ id: 'preset_instagram', icon: '📸', name: 'Instagram' },
			{ id: 'builtin', icon: '🌐', name: 'Встроенные хосты (33)' },
			{ id: 'tcp16', icon: '⚡', name: 'TCP 16-20 KB' }
		];

		var chipsRowEl = E('div', { class: 'bcw-chips-row' }, [
			E('span', { style: 'font-size: 12px; opacity: 0.7; margin-right: 4px;' }, 'Быстрый выбор:')
		]);

		quickChipsList.forEach(function(ch) {
			var btn = E('div', {
				class: 'bcw-chip-btn' + (currentTarget === ch.id ? ' active' : ''),
				click: function() { selectTarget(ch.id); }
			}, [
				E('span', {}, ch.icon),
				E('span', {}, ch.name)
			]);
			chipButtonsMap[ch.id] = btn;
			chipsRowEl.appendChild(btn);
		});

		var customDomainInput = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			placeholder: 'rutracker.org',
			value: 'rutracker.org',
			style: 'width: 380px; max-width: 100%; font-size: 14px; padding: 7px 12px;'
		});

		var customDomainRow = E('div', {
			style: 'display: none; margin-top: 14px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid #383e4a;'
		}, [
			E('label', { style: 'font-weight: bold; margin-right: 10px; display: inline-block; margin-bottom: 4px;' }, 'Домены для поиска (через пробел):'),
			customDomainInput
		]);

		// Test Strategy Mode Dropdown
		var testStrategySelectEl = E('select', {
			class: 'bcw-select',
			style: 'min-width: 260px;',
			change: function(e) {
				var chosen = e.target.value;
				if (!chosen) return;
				var found = zapretAllStrategies.find(function(s) { return s.section === chosen; });
				if (found && found.script) {
					activeCodeEl.textContent = found.script;
					activeMetaBadgesEl.innerHTML = '';
					activeMetaBadgesEl.appendChild(E('span', { class: 'badge', style: 'background: #3e4451; color: #fff; font-size: 11px;' }, 'Раздел: zapret2.' + found.section));
					activeMetaBadgesEl.appendChild(E('span', { class: 'badge', style: 'background: #3e4451; color: #fff; font-size: 11px;' }, 'Порт: ' + found.port));
					activeMetaBadgesEl.appendChild(E('span', { class: 'badge cbi-color-blue', style: 'font-size: 11px;' }, '🧪 Режим теста'));
				}
			}
		}, [
			E('option', { value: '' }, '-- Выберите стратегию для теста --')
		]);

		zapretAllStrategies.forEach(function(st) {
			testStrategySelectEl.appendChild(E('option', { value: st.section }, st.section + (st.enabled ? ' [Включена]' : ' [Отключена]')));
		});

		var testStrategyRow = E('div', {
			style: 'display: none; margin-top: 14px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid #383e4a;'
		}, [
			E('label', { style: 'font-weight: bold; margin-right: 10px;' }, 'Стратегия Zapret2:'),
			testStrategySelectEl
		]);

		// Summary Banner
		var summaryTitleEl = E('strong', { style: 'color: #61afef; font-size: 14px;' }, 'YouTube (3 хоста)');
		var summaryDescEl = E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 2px;' }, 'googlevideo.com, i.ytimg.com, youtube.com');
		var summaryStatusBadgeEl = E('span', { class: 'badge cbi-color-green', style: 'font-size: 12px; padding: 4px 10px;' }, '✓ Настроено в Zapret2');

		var targetSummaryBox = E('div', { class: 'bcw-target-summary' }, [
			E('div', {}, [
				summaryTitleEl,
				summaryDescEl
			]),
			summaryStatusBadgeEl
		]);

		var targetSectionCard = E('div', { class: 'bcw-card' }, [
			E('div', { class: 'bcw-card-header' }, [
				E('h3', { class: 'bcw-card-title' }, '1. Цель обхода (Пресеты Zapret Finder)')
			]),
			E('div', { class: 'bcw-mode-row' }, [
				E('label', { style: 'font-weight: bold; font-size: 14px; color: #abb2bf;' }, 'Режим работы:'),
				modeSelectEl
			]),
			chipsRowEl,
			customDomainRow,
			testStrategyRow,
			targetSummaryBox
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
			var pDef = PRESET_DEFS[currentTarget] || PRESET_DEFS['builtin'];
			var targetKey = pDef.key || currentTarget;
			var sData = zapretServicesData[targetKey];

			activeTargetTitleEl.textContent = pDef.name;
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
				activeCodeEl.textContent = '# Стратегия для выбранной цели (' + pDef.name + ') ещё не настроена в Zapret2.\n# Запустите турбо-поиск выше для автоматического подбора и активации!';
			}
		}

		function updateSummaryBox() {
			var pDef = PRESET_DEFS[currentTarget] || PRESET_DEFS['builtin'];
			summaryTitleEl.textContent = pDef.icon + ' ' + pDef.name;
			summaryDescEl.textContent = pDef.domainsText || pDef.domain;

			var sData = zapretServicesData[pDef.key || currentTarget];
			if (sData && sData.enabled) {
				summaryStatusBadgeEl.className = sData.is_circular ? 'badge cbi-color-blue' : 'badge cbi-color-green';
				summaryStatusBadgeEl.textContent = sData.is_circular ? '🔄 Активна Circular-связка (' + sData.section + ')' : '✓ Активна стратегия (' + sData.section + ')';
			} else {
				summaryStatusBadgeEl.className = 'badge cbi-color-neutral';
				summaryStatusBadgeEl.textContent = 'Не настроено в Zapret2';
			}
		}

		function selectTarget(targetId) {
			currentTarget = targetId;
			modeSelectEl.value = targetId;

			// Update chips
			quickChipsList.forEach(function(ch) {
				var b = chipButtonsMap[ch.id];
				if (b) {
					if (ch.id === targetId) b.classList.add('active');
					else b.classList.remove('active');
				}
			});

			customDomainRow.style.display = (targetId === 'domains' ? 'block' : 'none');
			testStrategyRow.style.display = (targetId === 'test_strategy' ? 'block' : 'none');

			updateSummaryBox();
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
			if (currentTarget === 'domains') {
				domain = customDomainInput.value.trim();
				if (!domain) {
					ui.addNotification(null, E('p', {}, 'Пожалуйста, укажите домен для проверки!'), 'danger');
					return;
				}
				// Clean domain in case user typed https:// or trailing slash
				domain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
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
							zapretAllStrategies = info.all_strategies || [];
							updateSummaryBox();
							updateActiveStrategyDisplay();
						});
						refreshLogs();

						if (st.auto_applied) {
							ui.addNotification(null, E('p', {}, '✓ Лучшая найденная стратегия автоматически применена в Zapret2 и проверена!'), 'info');
						}
					} else if (st.status === 'error') {
						resetScanUI();
						ui.addNotification(null, E('p', {}, st.phase || 'Ошибка сканирования. Проверьте домен и логи.'), 'danger');
						refreshLogs();
					}
				});
			}, 1500);
		}

		function updateProgressUI(st) {
			progressBarEl.style.width = (st.percent || 0) + '%';
			progressPercentEl.textContent = (st.percent || 0) + '%';
			progressTextEl.textContent = st.phase || '';
			if (st.status === 'done') {
				progressPhaseEl.textContent = 'Сканирование завершено';
				progressPhaseEl.style.color = '#00d1b2';
			} else if (st.status === 'error') {
				progressPhaseEl.textContent = 'Ошибка сканирования';
				progressPhaseEl.style.color = '#ff3860';
				progressBarEl.style.background = '#ff3860';
			}

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
						zapretAllStrategies = info.all_strategies || [];
						updateSummaryBox();
						updateActiveStrategyDisplay();
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
			var pDef = PRESET_DEFS[currentTarget] || PRESET_DEFS['builtin'];
			var url = pDef.test_url || 'https://rutracker.org';
			if (currentTarget === 'domains') {
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
					ui.addNotification(null, E('p', {}, '✓ Ресурс (' + url + ') доступен! Ответ HTTP ' + parsed.http_code), 'info');
				} else {
					ui.addNotification(null, E('p', {}, '✗ Ресурс (' + url + ') не отвечает через текущую стратегию Zapret2 (код ' + (parsed ? parsed.http_code : 0) + '). Запустите подбор стратегий!'), 'warning');
				}
			}).catch(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, 'Не удалось выполнить проверку.'), 'danger');
			});
		}

		function showUpdateBanner(info) {
			updateBannerCard.innerHTML = '';
			var releaseDate = info.release_date ? ' (' + info.release_date + ')' : '';
			var changelogText = info.changelog || 'Доступны новые улучшения и исправления BlockcheckW.';
			var repoName = info.repo || 'prostoy23rus/blockcheckw';

			updateBannerCard.appendChild(E('div', {
				style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px;'
			}, [
				E('div', { style: 'flex: 1; min-width: 260px;' }, [
					E('div', { style: 'font-size: 15px; font-weight: bold; color: #00d1b2; display: flex; align-items: center; gap: 8px;' }, [
						'🎉 Доступна новая версия: v' + (info.latest_version || '1.3.1'),
						E('span', { style: 'font-size: 12px; font-weight: normal; color: #828997;' }, releaseDate)
					]),
					E('div', { style: 'font-size: 13px; color: #e5e9f0; margin-top: 4px;' }, changelogText),
					E('div', { style: 'font-size: 11px; color: #abb2bf; margin-top: 3px;' }, 'Репозиторий: ' + repoName + ' (ветка main)')
				]),
				E('div', { style: 'display: flex; gap: 10px; align-items: center;' }, [
					E('button', {
						class: 'bcw-btn-launch',
						style: 'padding: 8px 18px; font-size: 13px;',
						click: function() { doRunUpdate(info.latest_version); }
					}, '🚀 Обновить из GitHub'),
					E('button', {
						class: 'bcw-btn-secondary',
						style: 'padding: 8px 14px; font-size: 13px;',
						click: function() { updateBannerCard.style.display = 'none'; }
					}, 'Скрыть')
				])
			]));
			updateBannerCard.style.display = 'block';
		}

		function doCheckUpdate(isManual) {
			if (isManual) {
				ui.showModal('Проверка обновлений', [
					E('p', { class: 'spinning' }, 'Запрос к репозиторию GitHub prostoy23rus/blockcheckw...')
				]);
			}

			fs.exec(HELPER_BIN, ['check_update']).then(function(res) {
				if (isManual) ui.hideModal();
				var parsed = null;
				try { parsed = JSON.parse(res.stdout); } catch(e) {}

				if (!parsed || !parsed.success) {
					if (isManual) {
						ui.addNotification(null, E('p', {}, 'Не удалось связаться с GitHub: ' + (parsed && parsed.error ? parsed.error : (res.stderr || 'ошибка сети'))), 'warning');
					}
					return;
				}

				if (parsed.has_update) {
					showUpdateBanner(parsed);
					if (isManual) {
						ui.addNotification(null, E('p', {}, '🎉 Доступна новая версия: v' + parsed.latest_version + '!'), 'info');
					}
				} else {
					updateBannerCard.style.display = 'none';
					if (isManual) {
						ui.addNotification(null, E('p', {}, '✓ У вас установлена актуальная версия BlockcheckW (v' + (parsed.current_version || '1.3.0') + ')!'), 'info');
					}
				}
			}).catch(function(err) {
				if (isManual) {
					ui.hideModal();
					ui.addNotification(null, E('p', {}, 'Ошибка при проверке обновлений: ' + err), 'danger');
				}
			});
		}

		function doRunUpdate(targetVer) {
			if (!confirm('Вы действительно хотите обновить BlockcheckW и LuCI интерфейс из GitHub (prostoy23rus/blockcheckw)?')) {
				return;
			}

			ui.showModal('Обновление службы BlockcheckW', [
				E('p', { class: 'spinning', style: 'font-size: 14px; font-weight: bold;' }, 'Загрузка свежих файлов из GitHub и обновление...'),
				E('div', { style: 'font-size: 12px; color: #abb2bf; margin-top: 10px; line-height: 1.6;' }, [
					'1. Загрузка обновленного скрипта управления и LuCI интерфейса',
					E('br'),
					'2. Обновление базы пресетов Zapret2 и генератора связок',
					E('br'),
					'3. Сброс кэша интерфейса LuCI и перезапуск службы rpcd'
				])
			]);

			fs.exec(HELPER_BIN, ['update']).then(function(res) {
				var parsed = null;
				try { parsed = JSON.parse(res.stdout); } catch(e) {}

				if (parsed && parsed.success) {
					ui.showModal('Обновление успешно выполнено', [
						E('p', { class: 'cbi-color-green', style: 'font-size: 16px; font-weight: bold;' }, '✓ ' + (parsed.message || 'Служба успешно обновлена!')),
						E('p', { style: 'margin-top: 8px;' }, 'Интерфейс автоматически перезагрузится через 3 секунды...'),
						E('div', { class: 'right', style: 'margin-top: 16px;' }, [
							E('button', {
								class: 'btn cbi-button-action',
								click: function() { location.reload(); }
							}, 'Перезагрузить страницу')
						])
					]);
					setTimeout(function() {
						location.reload();
					}, 3000);
				} else {
					ui.showModal('Ошибка обновления', [
						E('p', { class: 'cbi-color-red', style: 'font-weight: bold;' }, '✗ Не удалось обновить компоненты:'),
						E('pre', { class: 'bcw-code-box', style: 'color: #e06c75;' }, parsed && parsed.error ? parsed.error : (res.stderr || res.stdout || 'Неизвестная ошибка'))
					]);
				}
			}).catch(function(err) {
				ui.showModal('Ошибка сети', [
					E('p', { class: 'cbi-color-red' }, 'Сбой при выполнении команды обновления: ' + err)
				]);
			});
		}

		// Show update banner if new version is already detected
		if (versionInfo && versionInfo.has_update) {
			showUpdateBanner(versionInfo);
		}

		// Initial In-Memory Render
		updateSummaryBox();
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
