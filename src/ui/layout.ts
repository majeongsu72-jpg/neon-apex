const paths: Record<string, string> = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  settings: '<path d="m12 3 2 .6 1.3 2.1 2.5.1 1.5 1.5-.5 2.5 1.4 2-.6 2-2.4.8-.8 2.4-2 .6-2-1.4-2.5.5-1.5-1.5-.1-2.5-2.1-1.3-.6-2 1.4-2.1-.5-2.4 1.5-1.5 2.5-.1L10 3.6Z"/><circle cx="12" cy="12" r="3"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  flag: '<path d="M5 21V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0Zm0 2H4v3c0 3 2 4 5 4m7-7h4v3c0 3-2 4-5 4m-3 1v5m-4 3h8m-7-3h6"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
export const icon = (name: string, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`;

export const layout = `
  <div id="loading" class="loading-screen">
    <div class="loading-mark">N<span>/</span>A</div><div class="loading-line"><i></i></div>
    <p>도심을 밝히는 중<span class="loading-dots">...</span></p>
  </div>
  <div id="scene-vignette" aria-hidden="true"></div>
  <header class="game-header">
    <div class="brand"><span class="brand-mark">N</span><div>NEON APEX<small>AFTER HOURS RACING</small></div></div>
    <div class="header-track"><i></i><span>NIGHTFALL CIRCUIT</span><span class="header-divider">/</span><span>AFTER HOURS</span></div>
    <div class="header-actions">
      <button class="icon-button" data-action="settings" aria-label="설정" title="설정">${icon('settings')}</button>
      <button class="icon-button" data-action="fullscreen" aria-label="전체화면" title="전체화면">${icon('fullscreen')}</button>
    </div>
  </header>
  <main id="title-screen" class="screen title-screen">
    <div class="title-content">
      <div class="eyebrow"><span class="live-dot"></span>THE NIGHT IS YOURS<span class="edition">VOL. 01</span></div>
      <h1>NEON<br><span>APEX</span><span class="title-period">.</span></h1>
      <div class="title-tagline"><span class="tagline-rule"></span>빛보다 빠른 순간.</div>
      <p class="title-description">도시는 잠들었고, 레이스는 시작된다.<br>드리프트로 코너를 지배하고 니트로로 승부를 뒤집으세요.</p>
      <button class="primary-button start-button" data-action="briefing"><span>레이스 시작<small>LET’S OWN THE NIGHT</small></span>${icon('arrow')}</button>
      <div class="home-controls"><span><kbd>W A S D</kbd>주행</span><span><kbd>SPACE</kbd>드리프트</span><span><kbd>SHIFT</kbd>니트로</span></div>
    </div>
    <aside class="circuit-card">
      <div class="circuit-card-top"><span class="circuit-index">01<span>/</span></span><div><small>TONIGHT’S DESTINATION</small><h2>NIGHTFALL</h2><p>네온 도심 서킷</p></div><span class="night-badge">NIGHT</span></div>
      <canvas id="home-map" width="310" height="162" aria-label="나이트폴 서킷 지도"></canvas>
      <div class="circuit-stats"><div><strong>2.6<small>KM</small></strong><span>코스 길이</span></div><div><strong>03</strong><span>랩</span></div><div><strong>06</strong><span>드라이버</span></div></div>
      <div class="personal-best">${icon('trophy')}<span>최고 기록</span><strong id="home-best">—:——.——</strong></div>
    </aside>
    <footer class="home-footer"><span><i></i> SINGLE PLAYER<span class="footer-separator">/</span>NO LIMITS. JUST YOU.</span><span>BUILT FOR THE REDLINE<span class="footer-version">V.01</span></span></footer>
    <span class="car-caption">APX–01<span>STREET SPEC / 280 KM/H</span></span>
  </main>
  <section id="briefing-screen" class="screen overlay hidden" aria-labelledby="briefing-title">
    <div class="briefing-panel">
      <div class="eyebrow">DRIVER BRIEFING<span class="edition">01 / 01</span></div>
      <h2 id="briefing-title">당신의 라인으로<br><em>밤을 지배하세요.</em></h2>
      <p class="panel-description">6대의 차량. 3번의 랩. 단 하나의 결승선.</p>
      <div class="control-grid">
        <div><span class="key-pair"><kbd>W</kbd><kbd>↑</kbd></span><b>가속</b><small>속도를 끌어올리세요</small></div>
        <div><span class="key-pair"><kbd>S</kbd><kbd>↓</kbd></span><b>브레이크</b><small>코너 전에 감속하세요</small></div>
        <div><span class="key-pair"><kbd>A D</kbd><kbd>← →</kbd></span><b>조향</b><small>원하는 라인을 선택하세요</small></div>
        <div><kbd class="wide-key">SPACE</kbd><b>드리프트</b><small>조향과 함께 눌러 미끄러지세요</small></div>
        <div><kbd class="wide-key accent-key">SHIFT</kbd><b>니트로</b><small>직선 구간에서 폭발적으로</small></div>
        <div><span class="key-pair"><kbd>ESC</kbd><kbd>R</kbd></span><b>일시정지 · 코스 복귀</b><small>잠깐 숨을 고르고 다시 달리세요</small></div>
      </div>
      <div class="briefing-tip">${icon('bolt')}<p><b>코너는 기회입니다.</b> 드리프트로 니트로를 충전하고, 탈출할 때 사용하세요.</p></div>
      <div class="panel-buttons"><button class="text-button" data-action="home">돌아가기</button><button class="primary-button" data-action="race"><span>준비 완료</span>${icon('arrow')}</button></div>
    </div>
  </section>
  <div id="game-hud" class="hidden">
    <div class="race-progress"><div id="race-progress-fill"></div></div>
    <div class="race-top-left">
      <div class="position-widget"><span class="micro-label">POSITION <small>순위</small></span><div><strong id="position">6</strong><span>/ 6</span></div></div>
      <div class="lap-widget"><span class="micro-label">LAP <small>랩</small></span><div><strong id="lap">01</strong><span>/ 03</span></div></div>
      <div class="timing-widget"><span class="micro-label">RACE TIME</span><strong id="race-time">00:00.00</strong><span class="best-lap-label">BEST LAP <b id="best-lap">—:——.——</b></span></div>
    </div>
    <div class="leaderboard"><span class="micro-label">THE GRID<span class="leaderboard-dot"></span></span>
      ${Array.from({ length: 6 }, (_, i) => `<div class="driver-row" id="driver-${i}"><span class="driver-rank">${i + 1}</span><span class="driver-color"></span><b class="driver-name"></b><span class="driver-gap"></span></div>`).join('')}
    </div>
    <div class="minimap-panel"><div class="micro-label"><i></i><span id="district">NEON DISTRICT</span></div><canvas id="race-map" width="240" height="164" aria-label="차량 위치와 코스 지도"></canvas><span class="map-caption">NIGHTFALL<span>2.6 KM</span></span></div>
    <div class="speed-panel">
      <div class="speed-top"><span class="speed-top-name">APX–01 <span>STREET SPEC</span></span><div class="gear"><small>GEAR</small><b id="gear">1</b></div></div>
      <div class="speed-reading"><strong id="speed">000</strong><span>KM<span>/</span>H</span></div>
      <div class="rpm-strip">${Array.from({ length: 16 }, () => '<i></i>').join('')}</div>
      <div class="nitro-label"><span>${icon('bolt')}NITRO</span><span id="nitro-state">READY</span></div>
      <div class="nitro-track"><div id="nitro-fill"></div></div>
      <span class="nitro-key"><kbd>SHIFT</kbd>길게 눌러 부스트</span>
    </div>
    <div id="drift-chip" class="drift-chip hidden"><span>DRIFTING</span>${icon('bolt')}<b>니트로 충전</b></div>
    <div class="race-key-hints"><span><kbd>SPACE</kbd>드리프트</span><span><kbd>SHIFT</kbd>니트로</span><span><kbd>ESC</kbd>일시정지</span></div>
  </div>
  <div id="countdown" class="countdown hidden" aria-live="polite">3</div>
  <div id="lap-flash" class="lap-flash hidden"><small id="lap-flash-small">LAP COMPLETE</small><strong id="lap-flash-title">FINAL LAP</strong><span id="lap-flash-time"></span></div>
  <section id="pause-screen" class="screen overlay hidden" aria-labelledby="pause-title">
    <div class="pause-panel"><div class="eyebrow">TAKE A BREATH</div><h2 id="pause-title">잠깐의 <em>피트 스톱.</em></h2><p class="panel-description">도시는 기다립니다. 준비되면 다시 달리세요.</p>
      <button class="primary-button" data-action="resume">${icon('play')}<span>계속 달리기</span><kbd>ESC</kbd></button>
      <button class="secondary-button" data-action="race">처음부터 다시</button>
      <div class="pause-bottom"><button class="text-button" data-action="settings">${icon('settings')}설정</button><button class="text-button" data-action="home">메인 화면</button></div>
    </div>
  </section>
  <section id="result-screen" class="screen overlay hidden" aria-labelledby="result-title">
    <div class="result-panel"><div class="eyebrow">NIGHTFALL / RACE COMPLETE<span id="record-badge" class="record-badge hidden">NEW RECORD</span></div>
      <h2 id="result-title">결승선을 <em>넘어서.</em></h2><div class="finish-position"><strong id="finish-rank">01</strong><div><span>FINAL POSITION</span><b id="finish-caption">밤의 정상에 도착했습니다.</b></div><span class="finish-flag">${icon('flag')}</span></div>
      <div class="result-times"><div><span>총 주행 시간</span><strong id="finish-time">00:00.00</strong></div><div><span>최고 랩</span><strong id="finish-lap">00:00.00</strong></div></div>
      <div class="lap-breakdown">${[1, 2, 3].map(i => `<div><span>LAP 0${i}</span><b id="result-lap-${i}"></b></div>`).join('')}</div>
      <div class="panel-buttons"><button class="text-button" data-action="home">메인 화면</button><button class="primary-button" data-action="race"><span>한 번 더 달리기</span>${icon('arrow')}</button></div>
    </div>
  </section>
  <section id="settings-screen" class="screen settings-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="settings-panel"><div class="settings-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2 id="settings-title">드라이빙 설정</h2></div><button class="icon-button" data-action="close-settings" aria-label="설정 닫기">${icon('close')}</button></div>
      <label class="setting-row"><span><b>그래픽 품질</b><small>자동 모드는 부드러운 주행에 맞춰 조절합니다</small></span><select id="setting-quality" data-setting="quality" aria-label="그래픽 품질"><option value="auto">자동 · 권장</option><option value="low">낮음</option><option value="medium">중간</option><option value="high">높음</option></select></label>
      <label class="setting-row volume-row"><span><b>음악</b><small>밤의 질주를 위한 비트</small></span><div><input id="setting-music" data-setting="music" type="range" min="0" max="100" aria-label="음악 음량"><output id="music-value">32</output></div></label>
      <label class="setting-row volume-row"><span><b>효과음</b><small>엔진 · 타이어 · 니트로</small></span><div><input id="setting-effects" data-setting="effects" type="range" min="0" max="100" aria-label="효과음 음량"><output id="effects-value">72</output></div></label>
      <label class="setting-row"><span><b>화면 흔들림과 속도 효과</b><small>차분한 화면을 원하면 꺼주세요</small></span><span class="switch"><input id="setting-motion" data-setting="motion" type="checkbox" aria-label="화면 흔들림과 속도 효과"><i></i></span></label>
      <div class="settings-footer"><span><i></i>설정과 최고 기록이 이 브라우저에 저장됩니다.</span><button class="primary-button" data-action="close-settings">완료 ${icon('arrow')}</button></div>
    </div>
  </section>
  <div id="diagnostics" class="diagnostics hidden"></div>
  <section id="error-screen" class="screen overlay hidden"><div class="pause-panel"><div class="eyebrow">GRAPHICS UNAVAILABLE</div><h2>주행 화면을 시작할 수 없습니다.</h2><p class="panel-description" id="error-message">브라우저의 그래픽 가속을 켠 뒤 다시 시도해주세요.</p><button class="primary-button" data-action="retry">다시 시도 ${icon('arrow')}</button></div></section>
`;
