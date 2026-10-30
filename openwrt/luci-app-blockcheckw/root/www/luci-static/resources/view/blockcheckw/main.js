'use strict';
'require view';
'require fs';
'require ui';
'require poll';

var HELPER_BIN = '/usr/bin/blockcheckw-helper';
var isRunning = false;
var pollInterval = null;
var currentTarget = 'youtube';
var currentMode = 'turbo';
var doCircular = true;
var lastResults = [];
var lastCircular = '';

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
		return { zapret2_running: 'unknown', active_strategies: {} };
	}).catch(function() {
		return { zapret2_running: 'unknown', active_strategies: {} };
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			checkHelperStatus(),
			getZapretInfo()
		]);
	},

	render: function(data) {
		var statusData = data[0];
		var zapretInfo = data[1];

		var container = E('div', { class: 'cbi-map' });

		// Header
		var header = E('div', { style: 'margin-bottom: 20px;' }, [
			E('h2', { style: 'display: flex; align-items: center; justify-content: space-between;' }, [
				E('span', {}, [
					'⚡ BlockcheckW — Поиск стратегий Zapret2'
				]),
				E('span', {
					id: 'bcw-zapret-badge',
					class: (zapretInfo.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red',
					style: 'font-size: 13px; font-weight: normal; padding: 4px 10px; border-radius: 4px;'
				}, (zapretInfo.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен')
			]),
			E('div', { class: 'cbi-map-descr' }, [
				'Параллельный сканер и оптимизатор DPI для Zapret2. Автоматически тестирует обход блокировок, собирает отказоустойчивые Circular-стратегии и применяет их в роутер в один клик.'
			])
		]);
		container.appendChild(header);

		// Target Selector Card
		var targetCard = E('div', { class: 'cbi-section' }, [
			E('h3', {}, '1. Выберите сервис для обхода'),
			E('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 10px;' }, [
				E('div', {
					id: 'btn-target-youtube',
					class: 'cbi-button cbi-button-action' + (currentTarget === 'youtube' ? ' cbi-button-positive' : ''),
					style: 'padding: 16px; text-align: left; cursor: pointer; border-radius: 6px;',
					click: function() { selectTarget('youtube'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 16px;' }, '📺 YouTube'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Видео, превью, 1080p/4K стримы (googlevideo)')
				]),
				E('div', {
					id: 'btn-target-discord',
					class: 'cbi-button cbi-button-action' + (currentTarget === 'discord' ? ' cbi-button-positive' : ''),
					style: 'padding: 16px; text-align: left; cursor: pointer; border-radius: 6px;',
					click: function() { selectTarget('discord'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 16px;' }, '💬 Discord'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Голосовые каналы, шлюз, обмен файлами')
				]),
				E('div', {
					id: 'btn-target-general',
					class: 'cbi-button cbi-button-action' + (currentTarget === 'general' ? ' cbi-button-positive' : ''),
					style: 'padding: 16px; text-align: left; cursor: pointer; border-radius: 6px;',
					click: function() { selectTarget('general'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 16px;' }, '🌐 Блокированные сайты'),
					E('div', { style: 'font-size: 12px; opacity: 0.8; margin-top: 4px;' }, 'Рутрекер, X/Twitter, Instagram, ntc.party')
				]),
				E('div', {
					id: 'btn-target-custom',
					class: 'cbi-button cbi-button-action' + (currentTarget === 'custom' ? ' cbi-button-positive' : ''),
					style: 'padding: 16px; text-align: left; cursor: pointer; border-radius: 6px;',
					click: function() { selectTarget('custom'); }
				}, [
					E('div', { style: 'font-weight: bold; font-size: 16px;' }, '🎯 Свой домен'),
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
					style: 'width: 300px; max-width: 100%;'
				})
			])
		]);
		container.appendChild(targetCard);

		// Options & Launch Card
		var actionCard = E('div', { class: 'cbi-section' }, [
			E('h3', {}, '2. Параметры и запуск поиска'),
			E('div', { style: 'display: flex; flex-wrap: wrap; gap: 20px; align-items: center; margin: 15px 0;' }, [
				E('label', { style: 'cursor: pointer; display: flex; align-items: center; gap: 6px;' }, [
					E('input', {
						type: 'radio',
						name: 'scan_mode',
						checked: (currentMode === 'turbo'),
						change: function() { currentMode = 'turbo'; }
					}),
					E('strong', {}, '⚡ Турбо-поиск (10-15 сек)'),
					E('span', { style: 'font-size: 12px; opacity: 0.7;' }, '— быстрый опрос топ-стратегий 2026')
				]),
				E('label', { style: 'cursor: pointer; display: flex; align-items: center; gap: 6px;' }, [
					E('input', {
						type: 'radio',
						name: 'scan_mode',
						checked: (currentMode === 'full'),
						change: function() { currentMode = 'full'; }
					}),
					E('strong', {}, '🔬 Глубокий скан'),
					E('span', { style: 'font-size: 12px; opacity: 0.7;' }, '— полный перебор корпуса')
				]),
				E('label', { style: 'cursor: pointer; display: flex; align-items: center; gap: 6px; margin-left: auto;' }, [
					E('input', {
						id: 'chk-circular',
						type: 'checkbox',
						checked: doCircular,
						change: function(e) { doCircular = e.target.checked; }
					}),
					E('span', { style: 'font-weight: bold; color: #0072b2;' }, '🔄 Авто-сборка Circular-связки')
				])
			]),
			E('div', { style: 'display: flex; gap: 12px; align-items: center;' }, [
				E('button', {
					id: 'btn-start-scan',
					class: 'cbi-button cbi-button-primary',
					style: 'padding: 10px 24px; font-size: 15px; font-weight: bold;',
					click: function() { startScan(); }
				}, '▶ Запустить поиск'),
				E('button', {
					id: 'btn-stop-scan',
					class: 'cbi-button cbi-button-reset',
					style: 'display: none; padding: 10px 20px;',
					click: function() { stopScan(); }
				}, '■ Остановить'),
				E('button', {
					id: 'btn-test-active',
					class: 'cbi-button cbi-button-neutral',
					style: 'padding: 10px 16px; margin-left: auto;',
					click: function() { testActiveConnection(); }
				}, '🌐 Проверить доступность сейчас')
			])
		]);
		container.appendChild(actionCard);

		// Progress & Live Monitor Card
		var monitorCard = E('div', { id: 'bcw-monitor-card', class: 'cbi-section', style: 'display: none;' }, [
			E('h3', { id: 'bcw-progress-phase' }, 'Прогресс сканирования'),
			E('div', { style: 'background: #2a2a2a; border-radius: 8px; height: 22px; width: 100%; overflow: hidden; margin: 10px 0; border: 1px solid #444;' }, [
				E('div', {
					id: 'bcw-progress-bar',
					style: 'background: linear-gradient(90deg, #3273dc, #00d1b2); height: 100%; width: 0%; transition: width 0.3s ease;'
				})
			]),
			E('div', { style: 'display: flex; justify-content: space-between; font-size: 13px; opacity: 0.8;' }, [
				E('span', { id: 'bcw-progress-text' }, 'Подготовка...'),
				E('span', { id: 'bcw-progress-percent' }, '0%')
			]),
			E('div', { style: 'margin-top: 14px;' }, [
				E('details', {}, [
					E('summary', { style: 'cursor: pointer; font-size: 13px; color: #3273dc;' }, 'Показать лог работы консоли'),
					E('pre', {
						id: 'bcw-live-log',
						style: 'background: #1e1e1e; color: #a9b7c6; padding: 10px; border-radius: 6px; font-size: 12px; max-height: 220px; overflow-y: auto; margin-top: 8px;'
					}, '')
				])
			])
		]);
		container.appendChild(monitorCard);

		// Circular Strategy Result Card (Special Highlight)
		var circularCard = E('div', { id: 'bcw-circular-card', class: 'cbi-section', style: 'display: none; border: 2px solid #00d1b2; border-radius: 8px; background: rgba(0, 209, 178, 0.05);' }, [
			E('div', { style: 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;' }, [
				E('h3', { style: 'margin: 0; color: #00d1b2; display: flex; align-items: center; gap: 8px;' }, [
					'🛡️ Отказоустойчивая Circular-связка Zapret2',
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
				'Связка объединяет несколько независимых техник обхода (Fake ClientHello, Multisplit, Multidisorder). При сбое одной стратегии Zapret2 автоматически переключается на следующую за 20 секунд!'
			]),
			E('pre', {
				id: 'bcw-circular-code',
				style: 'background: #1e1e1e; color: #98c379; padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-all;'
			}, '')
		]);
		container.appendChild(circularCard);

		// Individual Results Section
		var resultsCard = E('div', { id: 'bcw-results-card', class: 'cbi-section', style: 'display: none;' }, [
			E('h3', {}, 'Найденные рабочие стратегии (100% проверено)'),
			E('div', { id: 'bcw-strategies-list', style: 'display: flex; flex-direction: column; gap: 12px; margin-top: 12px;' }, [])
		]);
		container.appendChild(resultsCard);

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
				'--workers', '2'
			];
			if (domain) {
				helperArgs.push('--domain', domain);
			}

			isRunning = true;
			fs.exec(HELPER_BIN, helperArgs).then(function(res) {
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
					}
				});
			}, 1500);
		}

		function updateProgressUI(st) {
			var pBar = document.getElementById('bcw-progress-bar');
			var pText = document.getElementById('bcw-progress-text');
			var pPercent = document.getElementById('bcw-progress-percent');
			var pPhase = document.getElementById('bcw-progress-phase');
			var liveLog = document.getElementById('bcw-live-log');

			if (pBar) pBar.style.width = (st.percent || 0) + '%';
			if (pPercent) pPercent.textContent = (st.percent || 0) + '%';
			if (pText) pText.textContent = st.phase || '';
			if (pPhase && st.status === 'done') pPhase.textContent = 'Сканирование завершено';
			if (liveLog && st.log) liveLog.textContent = st.log;

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
					class: 'cbi-value',
					style: 'background: #252525; padding: 14px; border-radius: 6px; border: 1px solid #3c3c3c; display: flex; flex-direction: column; gap: 8px;'
				}, [
					E('div', { style: 'display: flex; align-items: center; justify-content: space-between;' }, [
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
						style: 'background: #1a1a1a; padding: 8px; border-radius: 4px; font-size: 12px; color: #abb2bf; margin: 0; white-space: pre-wrap; word-break: break-all;'
					}, sText)
				]);
				list.appendChild(card);
			});
		}

		function applyStrategy(scriptText, isCirc) {
			ui.showModal('Применение стратегии', [
				E('p', { class: 'spinning' }, 'Запись в конфигурацию Zapret2 и перезапуск службы...')
			]);

			fs.exec(HELPER_BIN, ['apply', '--target', currentTarget, '--script', scriptText]).then(function(res) {
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
					// Refresh badge
					getZapretInfo().then(function(info) {
						var badge = document.getElementById('bcw-zapret-badge');
						if (badge) {
							badge.className = (info.zapret2_running === 'running') ? 'badge cbi-color-green' : 'badge cbi-color-red';
							badge.textContent = (info.zapret2_running === 'running') ? '✓ Zapret2 активен' : '✗ Zapret2 остановлен';
						}
					});
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
			if (currentTarget === 'youtube') url = 'https://rr1---sn-xguxaxjvh-n8me.googlevideo.com';
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
					ui.addNotification(null, E('p', {}, '✗ Ресурс не отвечает через текущую конфигурацию Zapret2 (код ' + (parsed ? parsed.http_code : 0) + '). Запустите подбор стратегий!'), 'warning');
				}
			}).catch(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, 'Не удалось выполнить проверку.'), 'danger');
			});
		}

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
