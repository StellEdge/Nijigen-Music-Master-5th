/* Runs from file:// as classic scripts; no server, build step, or network needed. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const lowPower = window.matchMedia('(pointer:coarse)').matches;
  let playbackTimer = null, lastProgressUpdate = 0;
  let nativeBackground = false, nativePublished = '', nativePublishedAt = 0;
  const backgrounded = () => nativeBackground || document.hidden;
  function syncPlaybackTimer() {
    const active = state === 'playing' || state === 'gap' || !audio.paused || !warmAudio.paused;
    if(active && !window.AndroidPlayback && playbackTimer === null) playbackTimer = setInterval(updatePlayback,50);
    else if(!active && playbackTimer !== null) {
      clearInterval(playbackTimer); playbackTimer = null;
      if(audioContext?.state === 'running') audioContext.suspend().then(() => {
        if(!audio.paused || !warmAudio.paused) audioContext.resume().catch(() => {});
      }).catch(() => {});
    }
    if(active && audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    publishNativePlayback();
  }
  const splashStarted = performance.now();
  for(const element of document.querySelectorAll('header,main')) element.inert = true;
  async function finishStartup(startup) {
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(resolve => window.addEventListener('load',resolve,{once:true}));
    const images = [...document.querySelectorAll('.splash-logo,.brand img,#cardPlaceholder img')].map(image => image.decode());
    await Promise.allSettled([startup,loaded,document.fonts.ready,...images]);
    const minimum = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    await new Promise(resolve => setTimeout(resolve,Math.max(0,minimum - (performance.now() - splashStarted))));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.body.classList.remove('app-loading');
    document.body.setAttribute('aria-busy','false');
    for(const element of document.querySelectorAll('header,main')) element.inert = false;
    $('splash').classList.add('splash-exit');
    setTimeout(() => $('splash')?.remove(),400);
  }
  const icons = {
    folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 9v7m-3-3 3 3 3-3"/>',
    list:'<path d="M4 5h11M4 10h8M4 15h6M18 8v10m0-10 4-1v9"/><ellipse cx="16" cy="18" rx="2" ry="1.5"/><ellipse cx="20" cy="16" rx="2" ry="1.5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    game:'<path d="M5 21V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
    warm:'<path d="M12 3c1 5 5 5 5 9 3-1 3-3 3-3 3 8-2 13-8 13S2 17 4 12c1 2 2 2 3 2-1-5 4-6 5-11Z"/>',
    shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
    sequence:'<path d="M3 7h17m-4-4 4 4-4 4M3 17h17m-4-4 4 4-4 4"/>',
    auto:'<path d="M20 7a9 9 0 1 0 1 10M20 3v5h-5"/><path d="m10 8 6 4-6 4Z"/>',
    tv:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 2 4 4 4-4M9 11h6m-6 4h4"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>', pause:'<path d="M8 4v16M16 4v16"/>',
    previous:'<path d="M5 4v16m14-1L7 12l12-7Z"/>', next:'<path d="M19 4v16M5 19l12-7L5 5Z"/>'
  };
  function iconButton(id, icon, label) {
    $(id).innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
    $(id).setAttribute('aria-label',label); $(id).title = label;
  }
  // Touch focus and sticky :hover are transient feedback, never the toggle state.
  // Retain normal focus-visible behavior for keyboard and accessibility navigation.
  document.addEventListener('click',event => {
    const button = event.target.closest?.('button');
    if(button && (event.pointerType === 'touch' || event.pointerType === 'pen' || (event.detail > 0 && window.matchMedia('(hover: none)').matches))) button.blur();
  });
  const audio = new Audio(); audio.preload = 'metadata';
  const defaultWarmup = 'assets/GRAND CARD TOUR   -The Fifth Anniversary Anthem-.mp3';
  const defaultWarmupLabel = '默认：GRAND CARD TOUR -The Fifth Anniversary Anthem-';
  const warmAudio = new Audio(); warmAudio.preload = 'metadata'; warmAudio.loop = true;
  let warmFile = null, warmURL = null, warmActive = false, warmToken = 0;
  const warmFadeDuration = 3000;
  let warmFadeStart = null, warmFadeTimer = null;
  const modes = {order:'shuffle',auto:true,tvSize:false,blind:false};
  const packs = [], selected = new Set(), settingsKeys = ['loop','length','gap','offset','randomStart','volume','encoding'];
  let gameActive = false;
  let packId = 0, queue = [], position = -1, current = null, state = 'idle', resumeState = 'playing', generation = 0;
  let bounds = { start: 0, end: 0 }, audioURL = null, imageURL = null, revealed = false, round = 0, history = [], issues = [];
  const outgoingImages = new Map(), retiredImages = new Set();
  let gapRemaining = 0, gapUntil = 0, importing = false, cancelMetadata = null;
  let noticeTimer;
  const nativeLoaded = new Set();
  let nativeImportQueue = Promise.resolve(), nativeExcluded = {};
  try { nativeExcluded = JSON.parse(localStorage.getItem('karuta.nativeExcluded') || '{}'); } catch {}
  const notice = text => {
    clearTimeout(noticeTimer); $('notice').textContent = text;
    $('notice').hidden = !/失败|无法|请选择|导入完成|正在导入/.test(text);
    noticeTimer = setTimeout(() => { $('notice').hidden = true; },4500);
  };
  const time = seconds => { const s = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`; };
  const value = (id, max) => Math.min(max, Math.max(0, Number($(id).value) || 0));
  function preferences() { return {...modes,...Object.fromEntries(settingsKeys.map(k => [k, $(k).type === 'checkbox' ? $(k).checked : $(k).value]))}; }
  try { const saved = JSON.parse(localStorage.getItem('karuta.preferences') || '{}'); for(const k of Object.keys(modes)) if(k in saved) modes[k] = typeof modes[k] === 'boolean' ? Boolean(saved[k]) : saved[k]; for (const k of settingsKeys) if (k in saved) { if ($(k).type === 'checkbox') $(k).checked = Boolean(saved[k]); else $(k).value = saved[k]; } } catch {}
  for (const k of settingsKeys) $(k).addEventListener('change', () => {
    try { localStorage.setItem('karuta.preferences', JSON.stringify(preferences())); } catch {}
    if (k === 'randomStart') $('offset').disabled = $('randomStart').checked;
    renderShortcuts();
  });
  $('offset').disabled = $('randomStart').checked;
  let audioContext = null, mainGain = null, warmGain = null, analyser = null, spectrumData = null;
  function prepareAudio() {
    if(!audioContext) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if(Context) {
        audioContext = new Context();
        analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .65;
        spectrumData = new Uint8Array(analyser.frequencyBinCount); analyser.connect(audioContext.destination);
        mainGain = audioContext.createGain(); warmGain = audioContext.createGain();
        audioContext.createMediaElementSource(audio).connect(mainGain).connect(analyser);
        audioContext.createMediaElementSource(warmAudio).connect(warmGain).connect(analyser);
        mainGain.gain.value = 0; warmGain.gain.value = 0;
        audio.volume = 1; warmAudio.volume = 1;
      }
    }
    if(audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  }
  function applyFades() {
    const volume = value('volume',1);
    const main = volume * Karuta.envelope(audio.currentTime,bounds.start,bounds.end);
    const warmFade = warmFadeStart === null ? 1 : Math.max(0,1 - (performance.now() - warmFadeStart) / warmFadeDuration);
    const warm = volume * warmFade * (Number.isFinite(warmAudio.duration) ? Karuta.envelope(warmAudio.currentTime,0,warmAudio.duration) : 0);
    if(audioContext) {
      mainGain.gain.setTargetAtTime(main,audioContext.currentTime,.015);
      warmGain.gain.setTargetAtTime(warm,audioContext.currentTime,.015);
    } else { audio.volume = main; warmAudio.volume = warm; }
  }
  function resetFade(gain, element) {
    if(gain) { gain.gain.cancelScheduledValues(audioContext.currentTime); gain.gain.setValueAtTime(0,audioContext.currentTime); }
    else element.volume = 0;
  }
  $('volume').addEventListener('input',applyFades);
  function renderShortcuts() {
    $('autoShortcut').setAttribute('aria-pressed',String(modes.auto));
    $('shuffleShortcut').setAttribute('aria-pressed',String(modes.order === 'shuffle'));
    iconButton('shuffleShortcut',modes.order === 'shuffle' ? 'shuffle' : 'sequence',modes.order === 'shuffle' ? '随机：下一局生效' : '顺序：下一局生效');
    $('shuffleShortcut').title = modes.order === 'shuffle' ? '下一局随机不重复；点击切换为顺序播放' : '下一局顺序播放；点击切换为随机不重复';
    $('limitShortcut').setAttribute('aria-pressed',String(modes.tvSize));
    $('reveal').setAttribute('aria-pressed',String(modes.blind));
  }
  function changeSetting(id, v) {
    modes[id] = v;
    if(id === 'blind') { revealed = !gameActive || !modes.blind; renderCurrent(); }
    if(id === 'auto' && gameActive && state === 'gap' && !modes.auto) setState('between');
    renderShortcuts();
    try { localStorage.setItem('karuta.preferences',JSON.stringify(preferences())); } catch {}
  }
  $('autoShortcut').onclick = () => changeSetting('auto',!modes.auto);
  $('shuffleShortcut').onclick = () => changeSetting('order',modes.order === 'shuffle' ? 'sequence' : 'shuffle');
  $('limitShortcut').onclick = () => changeSetting('tvSize',!modes.tvSize);
  const menus = [['settingsPanel','settingsButton','closeSettings'],['importPanel','importButton','closeImport'],['playlistPanel','playlistButton','closePlaylist']];
  function openMenu(id, open) {
    for(const [panel,button] of menus) { const active = panel === id && open; $(panel).hidden = !active; $(button).setAttribute('aria-expanded',String(active)); }
  }
  for(const [panel,button,close] of menus) {
    $(button).onclick = () => openMenu(panel,$(panel).hidden);
    $(close).onclick = () => { openMenu(panel,false); $(button).focus(); };
  }
  document.addEventListener('keydown', e => { if(e.key === 'Escape') { const active = menus.find(([p]) => !$(p).hidden); if(active) { openMenu(active[0],false); $(active[1]).focus(); } } });
  document.addEventListener('click',e => { for(const [panel,button] of menus) if(!$(panel).hidden && !$(panel).contains(e.target) && !$(button).contains(e.target)) openMenu(panel,false); },true);
  function stopWarmup(fade = false) {
    if(fade && warmActive && !warmAudio.paused) {
      if(warmFadeStart !== null) return;
      warmFadeStart = performance.now();
      iconButton('warmup','stop','热场音乐正在淡出');
      $('warmup').setAttribute('aria-pressed','false');
      warmFadeTimer = setTimeout(() => stopWarmup(),warmFadeDuration);
      return;
    }
    clearTimeout(warmFadeTimer); warmFadeTimer = null; warmFadeStart = null;
    ++warmToken; warmActive = false; warmAudio.pause(); warmAudio.removeAttribute('src'); warmAudio.load();
    if(warmURL) URL.revokeObjectURL(warmURL); warmURL = null;
    iconButton('warmup','warm','播放热场音乐'); $('warmup').setAttribute('aria-pressed','false');
    setState(state);
  }
  async function playWarmup() {
    if(warmActive) { stopWarmup(true); notice('热场音乐正在淡出…'); return; }
    if(state === 'loading') { notice('当前歌曲正在加载，请加载完成后再开始热场。'); return; }
    if(state === 'playing' || state === 'gap') await toggle();
    prepareAudio(); resetFade(warmGain,warmAudio);
    const token = ++warmToken; warmActive = true;
    iconButton('warmup','stop','停止热场音乐'); $('warmup').setAttribute('aria-pressed','true');
    setState(state); notice('正在准备热场音频…');
    try {
      if(warmFile) {
        if(!warmFile.size) throw new Error('音频文件为空');
        warmURL = URL.createObjectURL(warmFile); warmAudio.src = warmURL;
      } else warmAudio.src = defaultWarmup;
      await warmAudio.play(); if(token !== warmToken) return;
      $('seek').disabled = false;
      notice('热场音乐循环播放中，不计入牌序。再次点击停止，或播放其他音乐。');
    } catch(e) { if(token !== warmToken) return; stopWarmup(); notice('热场播放失败：' + e.message + '。可在读牌设置中更换音频。'); }
  }
  $('warmup').onclick = playWarmup;
  let logoTaps = 0, logoLastTap = -Infinity, logoStage = 0, logoReadyAt = 0, logoExpiresAt = 0, logoBubbleTimer;
  document.querySelector('.brand').addEventListener('click',event => {
    event.preventDefault();
    const now = performance.now();
    if(now < logoReadyAt) return;
    if(logoStage && now > logoExpiresAt) { logoStage = 0; logoTaps = 0; }
    if(now - logoLastTap > 1000) logoTaps = 0;
    logoLastTap = now;
    if(++logoTaps < 5) return;
    logoTaps = 0;
    const messages = ['你也渴望王之力吗','最好用的歌牌播放器 BY 星刃','最好的二次元之旅，感谢有你'];
    const bubble = $('logoBubble');
    bubble.textContent = messages[logoStage]; bubble.hidden = false;
    clearTimeout(logoBubbleTimer);
    logoBubbleTimer = setTimeout(() => { bubble.hidden = true; },logoStage === 2 ? 3500 : 2000);
    logoReadyAt = now + 2000; logoExpiresAt = logoReadyAt + 10000;
    if(logoStage === 2) {
      logoStage = 0;
      // Preserve an already-playing warmup rather than toggling it off.
      if(warmFadeStart !== null) stopWarmup();
      if(!warmActive) $('warmup').click();
    } else logoStage++;
  });
  $('warmupFileButton').onclick = () => $('warmupInput').click();
  $('warmupInput').onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    stopWarmup(); warmFile = file; $('warmupFileName').textContent = file.name; e.target.value = ''; playWarmup();
  };
  $('warmupResetButton').onclick = () => {
    const wasActive = warmActive;
    stopWarmup(); warmFile = null; $('warmupInput').value = '';
    $('warmupFileName').textContent = defaultWarmupLabel;
    if(wasActive) playWarmup();
    else notice('已恢复默认热场音乐。');
  };
  warmAudio.addEventListener('error',() => { if(warmActive) { stopWarmup(); notice('无法解码热场音频，请更换文件。'); } });
  function allSongs() { return packs.flatMap(p => p.songs); }
  function eligible() { return packs.filter(p => p.enabled).flatMap(p => p.songs).filter(s => selected.has(s.id)); }
  function setState(next) {
    state = next;
    syncPlaybackTimer();
    const labels = { idle:'准备就绪', loading:'加载音频', playing:'正在读牌', paused:'已暂停', gap:'牌间等待', between:'等待下一张', finished:'本轮结束' };
    $('state').textContent = labels[next];
    const isPlaying = next === 'playing' || next === 'gap';
    iconButton('play',isPlaying ? 'pause' : 'play',isPlaying ? '暂停' : '播放');
    $('play').setAttribute('aria-label',isPlaying ? '暂停' : '播放'); $('play').title = isPlaying ? '暂停' : '播放';
    iconButton('newRound',gameActive ? 'stop' : 'game',gameActive ? '结束游戏' : '开一局');
    $('newRound').classList.toggle('end-game',gameActive);
    $('newRound').setAttribute('aria-pressed',String(gameActive));
    $('gamePanel').classList.toggle('in-game',gameActive);
    document.body.classList.toggle('in-game',gameActive);
    if(!gameActive && next === 'playing') $('state').textContent = '正在播放';
    $('play').disabled = next === 'loading' || (['idle','finished'].includes(next) && !eligible().length);
    $('newRound').disabled = !gameActive && !eligible().length;
    $('next').disabled = !queue.length || next === 'loading';
    $('previous').disabled = position <= 0 || next === 'loading';
    $('seek').disabled = !current || !Number.isFinite(audio.duration) || next === 'loading' || !['playing','paused'].includes(next) || (next === 'paused' && resumeState !== 'playing');
    if(warmActive) { $('state').textContent = '热场播放'; $('seek').disabled = !Number.isFinite(warmAudio.duration); $('play').disabled = next === 'loading' || (!current && !eligible().length); }
    renderAnswer();
    renderProgress();
    publishNativePlayback(true);
  }
  function release() {
    if (cancelMetadata) cancelMetadata();
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (audioURL) URL.revokeObjectURL(audioURL); audioURL = null;
    retireImage(imageURL);
    imageURL = null;
    $('cover').hidden = true; $('cover').removeAttribute('src');
    $('card').style.removeProperty('--card-ratio');
  }
  function retireImage(url) {
    if(!url) return;
    if(outgoingImages.has(url)) retiredImages.add(url);
    else URL.revokeObjectURL(url);
  }
  function renderPacks() {
    $('packs').replaceChildren();
    for (const p of packs) {
      const el = document.createElement('div'); el.className = 'pack';
      const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = p.enabled;
      check.onchange = () => { p.enabled = check.checked; renderPacks(); renderSongs(); setState(state); };
      label.append(check, document.createTextNode(p.name)); const count = document.createElement('small'); count.textContent = p.songs.length + ' 首';
      const remove = document.createElement('button'); remove.textContent = '×'; remove.title = '移除此歌包'; remove.setAttribute('aria-label', '移除 ' + p.name);
      remove.onclick = () => {
        // Active queues retain file handles; stop first so removed packs are released.
        stop(); queue = []; position = -1; current = null; release();
        packs.splice(packs.indexOf(p),1); p.songs.forEach(s => selected.delete(s.id)); renderPacks(); renderSongs(); renderCurrent(); setState('idle');
        if(p.nativeId) {
          const exclusions = nativeExcluded[p.nativeId] || [];
          nativeExcluded[p.nativeId] = [...new Set([...exclusions,p.manifest])];
          try { localStorage.setItem('karuta.nativeExcluded',JSON.stringify(nativeExcluded)); } catch {}
          if(!packs.some(pack => pack.nativeId === p.nativeId)) { window.AndroidFiles?.forgetPack?.(p.nativeId); nativeLoaded.delete(p.nativeId); }
        }
      };
      el.append(label,count,remove); $('packs').append(el);
    }
    $('total').textContent = allSongs().length + ' 首';
    $('packSummary').textContent = packs.length ? '当前歌包：' + packs.filter(p => p.enabled).map(p => p.name).join(' · ') : '尚未加载歌包';
    renderPlaylistPacks();
  }
  function renderPlaylistPacks() {
    const list = $('playlistPacks'); list.replaceChildren();
    for(const pack of packs) {
      const count = pack.enabled ? pack.songs.filter(song => selected.has(song.id)).length : 0;
      const label = document.createElement('label'); label.className = 'playlist-pack';
      const check = document.createElement('input'); check.type = 'checkbox';
      check.checked = count === pack.songs.length; check.indeterminate = count > 0 && count < pack.songs.length;
      check.setAttribute('aria-label','选择歌包 ' + pack.name);
      const name = document.createElement('span'); name.textContent = pack.name;
      const total = document.createElement('small'); total.textContent = `${count} / ${pack.songs.length}`;
      check.onchange = () => {
        if(check.checked) { pack.enabled = true; pack.songs.forEach(song => selected.add(song.id)); }
        else pack.songs.forEach(song => selected.delete(song.id));
        renderPacks(); renderSongs(); setState(state);
      };
      label.append(check,name,total); list.append(label);
    }
    if(!packs.length) { const empty = document.createElement('small'); empty.textContent = '尚未加载歌包'; list.append(empty); }
  }
  function visibleSongs() {
    const q = $('search').value.trim().toLocaleLowerCase();
    return packs.filter(p => p.enabled).flatMap(p => p.songs).filter(s => [s.title,s.artist,s.animation,s.translated,s.subtitle,s.no].some(v => v.toLocaleLowerCase().includes(q)));
  }
  function renderSongs() {
    renderPlaylistPacks();
    const list = $('songs'); list.replaceChildren();
    for (const s of visibleSongs()) {
      const row = document.createElement('div'); row.className = 'song' + (current?.id === s.id ? ' active' : '');
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(s.id); check.setAttribute('aria-label', '选择曲目 ' + s.no);
      check.onchange = () => { if (check.checked) selected.add(s.id); else selected.delete(s.id); renderPlaylistPacks(); setState(state); };
      const no = document.createElement('span'); no.className = 'no'; no.textContent = s.no;
      const button = document.createElement('button'), title = document.createElement('strong'), meta = document.createElement('small');
      title.textContent = gameActive && modes.blind ? '未揭晓的歌牌' : s.title;
      meta.textContent = gameActive && modes.blind ? s.pack.name : [s.artist,s.animation].filter(Boolean).join(' · ') || s.pack.name;
      button.append(title,meta); button.onclick = () => { gameActive ? selectGameSong(s) : startMusic(s); openMenu('playlistPanel',false); };
      row.append(check,no,button); list.append(row);
    }
    if (!list.childNodes.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = packs.length ? '无匹配曲目' : '暂无曲目'; list.append(empty); }
  }
  function answerVisible() {
    return !current || !gameActive || !modes.blind || (!warmActive && (
      (['gap','between','finished'].includes(state) && revealed) ||
      (state === 'paused' && resumeState === 'gap') ||
      (['playing','paused'].includes(state) && Karuta.revealWindow(audio.currentTime,bounds.start,bounds.end))));
  }
  function renderAnswer() {
    if(warmActive) {
      $('card').style.removeProperty('--card-ratio');
      $('title').textContent = (warmFile?.name || defaultWarmup.split('/').pop()).replace(/\.[^.]+$/,'');
      $('anime').textContent = '热场音乐';
      $('artist').textContent = ''; $('subtitle').textContent = '';
      $('cover').hidden = true; $('cardPlaceholder').hidden = false;
      $('placeholderText').textContent = '';
      $('reveal').setAttribute('aria-pressed',String(modes.blind));
      return;
    }
    const hidden = current && !answerVisible();
    if(imageURL && !hidden && current?.imageRatio) $('card').style.setProperty('--card-ratio',current.imageRatio);
    else $('card').style.removeProperty('--card-ratio');
    $('title').textContent = !current ? '' : hidden ? '未揭晓' : current.title;
    $('anime').textContent = !current || hidden ? '' : current.animation || current.pack.name;
    $('artist').textContent = !current || hidden ? '' : [current.artist,current.translated].filter(Boolean).join(' · ');
    $('subtitle').textContent = hidden || !current ? '' : current.subtitle;
    $('cover').hidden = !imageURL || hidden;
    $('cardPlaceholder').hidden = Boolean(imageURL && !hidden);
    $('placeholderText').textContent = '';
    $('reveal').setAttribute('aria-pressed',String(modes.blind));
  }
  function renderCurrent() {
    renderAnswer();
    renderSongs(); renderHistory();
  }
  function renderProgress() {
    const activeAudio = warmActive ? warmAudio : audio;
    $('elapsed').textContent = time(activeAudio.currentTime);
    $('duration').textContent = time(activeAudio.duration);
    $('seek').max = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 1;
    $('seek').value = activeAudio.currentTime || 0;
    $('roundProgress').textContent = gameActive && queue.length ? `${Math.max(0,position + 1)} / ${queue.length}${state === 'gap' ? ` · ${Math.max(0,Math.ceil((gapUntil - performance.now()) / 1000))}s` : ''}` : '';
  }
  function renderHistory() {
    const list = $('history'); list.replaceChildren();
    for (const h of [...history].reverse()) {
      const li = document.createElement('li'), n = document.createElement('b'); n.textContent = String(h.number).padStart(2,'0');
      const hide = gameActive && modes.blind && !h.revealed;
      li.append(n,document.createTextNode(hide ? '未揭晓' : h.title)); list.append(li);
    }
    if (!history.length) { const li = document.createElement('li'); li.textContent = '还没有读过的歌牌'; list.append(li); }
  }
  function showAnswer() { if (!current) return; revealed = true; const h = history.findLast(h => h.id === current.id); if (h) h.revealed = true; renderCurrent(); }
  function addIssues(newIssues) { issues.push(...newIssues); $('issues').textContent = issues.join('\n') || '暂无问题'; $('issueCount').textContent = issues.length; if (newIssues.length) $('diagnostics').open = true; }
  async function importEntries(entries, source, nativeId = null) {
    const manifests = [...entries.keys()].filter(n => /(^|\/)data\.csv$/i.test(n));
    if (!manifests.length) throw new Error('没有找到 data.csv。请选择包含 CSV 和音频的完整歌包。');
    for (const manifest of manifests) {
      if(nativeId && nativeExcluded[nativeId]?.includes(manifest)) continue;
      const directory = manifest.includes('/') ? manifest.slice(0,manifest.lastIndexOf('/')) : '';
      const name = directory.split('/').pop() || source.replace(/\.zip$/i,'');
      try {
        const bytes = await (await entries.get(manifest).getBlob()).arrayBuffer();
        const parsed = Karuta.parsePack(Karuta.decode(bytes, $('encoding').value), directory, entries);
        addIssues(parsed.errors.map(e => name + '：' + e));
        if (!parsed.songs.length) { addIssues([name + '：没有可播放的歌曲']); continue; }
        const p = { id: ++packId, name, enabled: true, songs: [], nativeId, manifest };
        p.songs = parsed.songs.map((s,i) => ({...s, id:`${p.id}:${i}`, pack:p, audio:entries.get(s.audioPath), image:entries.get(s.imagePath)}));
        p.songs.forEach(s => selected.add(s.id)); packs.push(p);
      } catch(e) { addIssues([name + '：' + e.message]); }
    }
  }
  async function importFiles(files) {
    if (importing) { notice('正在导入，请稍候。'); return; }
    if (!files.length || files.some(f => !/\.zip$/i.test(f.name) || f.webkitRelativePath || f.relativePath)) { notice('请选择 ZIP 曲包，不支持文件夹或散文件。'); return; }
    importing = true; notice('正在导入 ZIP 曲包…');
    const before = packs.length;
    try {
      for (const f of files) {
        try { await importEntries(await KarutaZip.readZip(f),f.name,f.nativeId || null); }
        catch(e) { addIssues([f.name + '：' + e.message]); }
      }
      notice(`导入完成：新增 ${packs.length - before} 个歌包，共 ${allSongs().length} 首。${issues.length ? '请查看左下方导入诊断。' : '点击开始读牌。'}`);
    } catch(e) { addIssues([e.message]); notice('导入失败：' + e.message); }
    finally { importing = false; renderPacks(); renderSongs(); setState(state); if(packs.length > before) openMenu('importPanel',false); }
  }
  $('zipButton').onclick = () => $('zipInput').click();
  $('zipInput').onchange = async e => { await importFiles([...e.target.files]); e.target.value = ''; };
  function nativeZipFile(metadata) {
    if(!Number.isSafeInteger(metadata.size) || metadata.size < 0 || !metadata.url.startsWith(location.origin + '/imports/')) throw new Error('曲包信息无效');
    return {name:metadata.name,size:metadata.size,nativeId:metadata.id,slice(start = 0,end = metadata.size) {
      const begin = Math.max(0,Math.min(metadata.size,start)), limit = Math.max(begin,Math.min(metadata.size,end));
      const getBlob = async () => {
        if(limit === begin) return new Blob([]);
        if(typeof window.AndroidFiles?.readPackRange === 'function') {
          const chunks = [];
          for(let offset = begin; offset < limit; offset += 1024 * 1024) {
            const end = Math.min(limit,offset + 1024 * 1024);
            let result;
            try { result = JSON.parse(window.AndroidFiles.readPackRange(metadata.id,offset,end)); }
            catch { throw new Error('曲包读取失败，请重新选择 ZIP 文件'); }
            if(result.error) throw new Error(result.error);
            const bytes = Uint8Array.from(atob(result.data),character => character.charCodeAt(0));
            if(bytes.length !== end - offset) throw new Error('曲包内容已变更或读取不完整，请重新导入');
            chunks.push(bytes);
            // Let UI work run between large audio chunks; never encode the entire ZIP.
            if(end < limit) await new Promise(resolve => setTimeout(resolve,0));
          }
          return new Blob(chunks);
        }
        let response;
        try { response = await fetch(metadata.url,{headers:{Range:`bytes=${begin}-${limit - 1}`},cache:'no-store'}); }
        catch { throw new Error('曲包读取请求失败，请重新选择 ZIP 文件；若仍失败，请更新 APK'); }
        if(response.status !== 206) throw new Error('曲包无法读取，请重新选择 ZIP 文件');
        const blob = await response.blob();
        if(blob.size !== limit - begin) throw new Error('曲包内容已变更或读取不完整，请重新导入');
        return blob;
      };
      return {getBlob,arrayBuffer:async () => (await getBlob()).arrayBuffer()};
    }};
  }
  window.karutaImportNativePacks = (ids = null, manual = false) => {
    nativeImportQueue = nativeImportQueue.catch(() => {}).then(async () => {
      if(!window.AndroidFiles?.listPacks) return;
      let saved;
      try { saved = JSON.parse(window.AndroidFiles.listPacks()); } catch { addIssues(['无法恢复已保存曲包，请重新导入 ZIP']); return; }
      for(const metadata of saved) {
        if(ids && !ids.includes(metadata.id)) continue;
        if(nativeLoaded.has(metadata.id)) continue;
        if(metadata.error) { addIssues([metadata.error]); continue; }
        if(manual) { delete nativeExcluded[metadata.id]; try { localStorage.setItem('karuta.nativeExcluded',JSON.stringify(nativeExcluded)); } catch {} }
        const before = packs.length;
        try { await importFiles([nativeZipFile(metadata)]); }
        catch(e) { addIssues([metadata.name + '：' + e.message]); }
        if(packs.length > before) nativeLoaded.add(metadata.id);
        else window.AndroidFiles.forgetPack?.(metadata.id);
      }
    });
    return nativeImportQueue;
  };
  $('dropzone').addEventListener('keydown', e => { if (e.target === $('dropzone') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('zipInput').click(); } });
  document.addEventListener('dragover',e => e.preventDefault()); document.addEventListener('drop',e => e.preventDefault());
  $('dropzone').ondragover = e => { e.preventDefault(); $('dropzone').classList.add('drag'); };
  $('dropzone').ondragleave = () => $('dropzone').classList.remove('drag');
  $('dropzone').ondrop = async e => {
    e.preventDefault(); $('dropzone').classList.remove('drag');
    const items = [...(e.dataTransfer.items || [])].filter(i => i.kind === 'file');
    if(items.some(i => i.webkitGetAsEntry?.()?.isDirectory)) { notice('请选择 ZIP 曲包，不支持文件夹。'); return; }
    await importFiles([...e.dataTransfer.files]);
  };
  async function waitMetadata(token) {
    return new Promise((resolve,reject) => {
      const cleanup = () => { clearTimeout(timeout); audio.removeEventListener('loadedmetadata',ok); audio.removeEventListener('error',bad); cancelMetadata = null; };
      const ok = () => { cleanup(); token === generation ? resolve() : reject(new Error('已取消')); };
      const bad = () => { cleanup(); reject(new Error('浏览器无法解码此音频，请检查文件或转换为 MP3 / WAV')); };
      const cancel = () => { cleanup(); reject(new Error('已取消')); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('读取音频超时')); }, 15000);
      cancelMetadata = cancel;
      audio.addEventListener('loadedmetadata',ok); audio.addEventListener('error',bad);
    });
  }
  function startRound(first = null) {
    if(warmActive) stopWarmup();
    let songs = eligible();
    if (first && !songs.some(s => s.id === first.id)) songs.unshift(first);
    if (!songs.length) { notice('请至少选择一首歌曲。'); return; }
    queue = modes.order === 'shuffle' ? Karuta.shuffle(songs) : [...songs];
    if (first) queue = [first,...queue.filter(s => s.id !== first.id)];
    gameActive = true; round++; history = []; position = -1; loadAt(0);
  }
  function startMusic(first = null) {
    const songs = eligible();
    if(first && !songs.some(s => s.id === first.id)) songs.unshift(first);
    if(!songs.length) return;
    gameActive = false; queue = modes.order === 'shuffle' ? Karuta.shuffle(songs) : [...songs];
    if(first) queue = [first,...queue.filter(s => s.id !== first.id)];
    position = -1; loadAt(0);
  }
  function selectGameSong(song) {
    const index = queue.findIndex(s => s.id === song.id);
    if(index >= 0) loadAt(index);
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const spectrumCanvas = $('spectrum'), spectrumContext = spectrumCanvas.getContext('2d');
  let spectrumFrame = 0, spectrumTimer = 0, spectrumLastFrame = 0, spectrumRegion = {top:0,bottom:0,left:0,width:0};
  function positionSpectrum() {
    const width = innerWidth, height = innerHeight, rootStyle = getComputedStyle(document.documentElement);
    const safeBottom = parseFloat(rootStyle.getPropertyValue('--safe-bottom')) || 0;
    let left = parseFloat(rootStyle.getPropertyValue('--safe-left')) || 0;
    const right = parseFloat(rootStyle.getPropertyValue('--safe-right')) || 0;
    let top, bottom, bandWidth = Math.max(0,width - left - right);
    if(width >= 480 && width > height) {
      const area = document.querySelector('.card-area').getBoundingClientRect();
      const dock = document.querySelector('.playback-dock').getBoundingClientRect();
      // Keep the spectrum below the card, entirely inside the left column.
      left = Math.max(0,area.left + 8);
      bandWidth = Math.max(0,Math.min(area.right - 8,dock.left - 16) - left);
      bottom = Math.max(0,Math.min(dock.bottom,height - safeBottom - 16));
      top = Math.max(area.top,bottom - height * .19);
    } else {
      const info = document.querySelector('.song-info').getBoundingClientRect();
      bottom = Math.max(0,info.top - 8);
      top = Math.max(0,bottom - Math.min(180,height * .18));
    }
    spectrumRegion = {top,bottom,left,width:bandWidth};
    // Keep the rendered band inspectable without reading layout in every audio frame.
    spectrumCanvas.dataset.bandTop = top; spectrumCanvas.dataset.bandBottom = bottom;
    spectrumCanvas.dataset.bandLeft = left; spectrumCanvas.dataset.bandWidth = bandWidth;
  }
  function resizeSpectrum() {
    const ratio = Math.min(window.devicePixelRatio || 1,lowPower ? 1 : 1.5);
    spectrumCanvas.width = Math.round(innerWidth * ratio); spectrumCanvas.height = Math.round(innerHeight * ratio);
    spectrumContext.setTransform(ratio,0,0,ratio,0,0);
    positionSpectrum();
  }
  function clearSpectrum() {
    clearTimeout(spectrumTimer); spectrumTimer = 0;
    cancelAnimationFrame(spectrumFrame); spectrumFrame = 0;
    spectrumContext.clearRect(0,0,innerWidth,innerHeight); spectrumCanvas.classList.remove('live');
  }
  function startSpectrum() {
    if(spectrumFrame || spectrumTimer || backgrounded() || reducedMotion.matches || !analyser) return;
    const draw = timestamp => {
      if(backgrounded() || reducedMotion.matches || ((audio.paused || audio.ended) && (warmAudio.paused || warmAudio.ended))) { clearSpectrum(); return; }
      spectrumFrame = 0;
      spectrumTimer = setTimeout(() => { spectrumTimer = 0; spectrumFrame = requestAnimationFrame(draw); },lowPower ? 40 : 24);
      spectrumLastFrame = timestamp; analyser.getByteFrequencyData(spectrumData);
      spectrumContext.clearRect(0,0,innerWidth,innerHeight);
      const {width,left,top,bottom} = spectrumRegion, center = (top + bottom) / 2, range = Math.max(0,(bottom - top) / 2);
      const gradient = spectrumContext.createLinearGradient(0,center - range,0,center + range);
      gradient.addColorStop(0,'rgba(93,103,118,0.02)'); gradient.addColorStop(.5,'rgba(93,103,118,0.3)'); gradient.addColorStop(1,'rgba(93,103,118,0.02)');
      spectrumContext.fillStyle = gradient;
      for(const bar of Karuta.spectrumBars(width,spectrumData)) {
        const barHeight = bar.magnitude * range;
        if(barHeight < 1) continue;
        const x = left + bar.x, y = center - barHeight, w = bar.width, h = barHeight * 2, radius = Math.min(w / 2,h / 2);
        spectrumContext.beginPath();
        if(spectrumContext.roundRect) spectrumContext.roundRect(x,y,w,h,radius);
        else {
          spectrumContext.moveTo(x + radius,y); spectrumContext.arcTo(x + w,y,x + w,y + h,radius);
          spectrumContext.arcTo(x + w,y + h,x,y + h,radius); spectrumContext.arcTo(x,y + h,x,y,radius); spectrumContext.arcTo(x,y,x + w,y,radius);
        }
        spectrumContext.closePath(); spectrumContext.fill();
      }
      spectrumCanvas.classList.add('live');
    };
    spectrumFrame = requestAnimationFrame(draw);
  }
  resizeSpectrum(); window.addEventListener('resize',resizeSpectrum);
  const spectrumLayoutObserver = new ResizeObserver(positionSpectrum);
  for(const element of [document.querySelector('.stage'),document.querySelector('.card-area'),document.querySelector('.song-info'),document.querySelector('.playback-dock')]) spectrumLayoutObserver.observe(element);
  audio.addEventListener('playing',() => { if(warmActive) stopWarmup(); startSpectrum(); }); warmAudio.addEventListener('playing',startSpectrum);
  function animateCard(direction, outgoing = false) {
    const card = $('card'), area = card.parentElement;
    const distance = Math.min(window.innerWidth,card.offsetWidth + 100);
    if(outgoing && current && card.style.visibility !== 'hidden' && !reducedMotion.matches && card.animate) {
      const pose = getComputedStyle(card);
      const initial = {transform:pose.transform,opacity:pose.opacity};
      const old = card.cloneNode(true); old.classList.add('outgoing-card'); old.removeAttribute('id');
      // Freeze the rendered face before removing IDs or changing its layout context.
      // Percentage heights and ID-based placeholder rules otherwise reflow in the clone.
      const originals = [card,...card.querySelectorAll('*')];
      const copies = [old,...old.querySelectorAll('*')];
      originals.forEach((element,i) => {
        const computed = getComputedStyle(element);
        for(const property of computed) copies[i].style.setProperty(property,computed.getPropertyValue(property));
      });
      old.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      old.setAttribute('aria-hidden','true');
      Object.assign(old.style,{position:'absolute',left:card.offsetLeft + 'px',top:card.offsetTop + 'px',width:pose.width,height:pose.height,maxWidth:'none',maxHeight:'none',margin:'0',animation:'none',translate:pose.translate,rotate:pose.rotate,pointerEvents:'none',zIndex:'2'});
      const url = imageURL;
      if(url) outgoingImages.set(url,(outgoingImages.get(url) || 0) + 1);
      area.append(old);
      old.animate([
        initial,
        {transform:`translateX(${-direction * distance}px) translateY(22px) rotate(${-direction * 11}deg)`,opacity:0}
      ],{duration:440,easing:'cubic-bezier(.4,0,.8,.35)',fill:'forwards'}).finished.catch(() => {}).finally(() => {
        old.remove();
        if(url) {
          const remaining = outgoingImages.get(url) - 1;
          if(remaining) outgoingImages.set(url,remaining);
          else {
            outgoingImages.delete(url);
            if(retiredImages.delete(url)) URL.revokeObjectURL(url);
          }
        }
      });
    }
    card.getAnimations().forEach(a => { if(a.animationName !== 'card-sway') a.cancel(); });
    if(outgoing || reducedMotion.matches || !card.animate) return;
    card.animate([
      {transform:`translateX(${direction * distance}px) translateY(-14px) rotate(${direction * 8}deg)`,opacity:0},
      {transform:'translateX(-6px) translateY(-7px) rotate(-1.8deg)',opacity:1,offset:.82},
      {transform:'translateX(0) translateY(-4px) rotate(-1.3deg)',opacity:1}
    ],{duration:620,easing:'cubic-bezier(.18,.75,.24,1)'});
  }
  async function loadArtwork(song, token, direction, replay) {
    let url = null;
    try {
      if(song.image) {
        const blob = await song.image.getBlob();
        if(token !== generation) return;
        url = URL.createObjectURL(blob);
        const image = new Image(); image.src = url;
        await image.decode();
        if(token !== generation) { URL.revokeObjectURL(url); return; }
        song.imageRatio = image.naturalWidth / image.naturalHeight;
        imageURL = url; $('cover').src = url;
      }
    } catch(e) {
      if(url) URL.revokeObjectURL(url);
      if(token !== generation) return;
      addIssues([song.title + ' 图片：' + e.message]);
    }
    if(token !== generation) return;
    renderAnswer();
    $('card').style.visibility = '';
    if(!replay) animateCard(direction);
  }
  function animateAmbient() {
    if(reducedMotion.matches || lowPower) return;
    for(const [i,orb] of [...document.querySelectorAll('.ambient i')].entries()) {
      const drift = () => {
        if(backgrounded()) return;
        orb.getAnimations().forEach(a => a.cancel());
        orb.animate([
          {transform:orb.dataset.pose || 'translate(0,0) scale(1)'},
          {transform:`translate(${(Math.random() - .5) * 26}vw,${(Math.random() - .5) * 22}vh) scale(${.9 + Math.random() * .25})`}
        ],{duration:5500 + Math.random() * 4000,easing:'ease-in-out',fill:'forwards'}).finished.then(() => {
          if(reducedMotion.matches) return;
          orb.dataset.pose = getComputedStyle(orb).transform; drift();
        }).catch(() => {});
      };
      orb.dataset.orb = i; drift();
    }
  }
  document.addEventListener('visibilitychange',() => {
    for(const orb of document.querySelectorAll('.ambient i')) for(const animation of orb.getAnimations()) backgrounded() ? animation.pause() : animation.play();
    if(backgrounded()) clearSpectrum(); else startSpectrum();
  });
  reducedMotion.addEventListener('change',() => {
    document.querySelectorAll('.ambient i').forEach(orb => orb.getAnimations().forEach(a => a.cancel()));
    clearSpectrum(); if(!reducedMotion.matches) { animateAmbient(); startSpectrum(); }
  });
  animateAmbient();
  async function loadAt(index, replay = false) {
    if (index < 0 || index >= queue.length) return;
    if(warmActive) stopWarmup();
    prepareAudio(); resetFade(mainGain,audio);
    const direction = index < position ? -1 : 1;
    if(!replay) animateCard(direction,true);
    const token = ++generation; release(); position = index; current = queue[index]; revealed = !gameActive || !modes.blind;
    setState('loading'); renderCurrent(); notice('正在加载本张音频…');
    // Decode and size the incoming card before showing it; audio loads independently.
    $('card').style.visibility = 'hidden';
    loadArtwork(current,token,direction,replay);
    try {
      const blob = await current.audio.getBlob(); if (token !== generation) return;
      if (!blob.size) throw new Error('音频文件为空');
      audioURL = URL.createObjectURL(blob);
      audio.src = audioURL;
      const ready = waitMetadata(token); audio.load(); await ready;
      if (token !== generation) return;
      bounds = gameActive ? Karuta.segment(audio.duration,value('offset',86400),value('length',3600),$('randomStart').checked,Karuta.randomUnit,modes.tvSize ? 80 : Infinity) : {start:0,end:audio.duration};
      audio.currentTime = bounds.start;
      await audio.play(); if (token !== generation) return;
      if (gameActive && !replay) history.push({id:current.id,number:history.length+1,title:current.title,artist:current.artist,animation:current.animation,pack:current.pack.name,start:bounds.start,end:bounds.end,revealed,at:new Date().toISOString()});
      setState('playing'); renderHistory(); notice(`播放片段 ${time(bounds.start)} — ${time(bounds.end)}。${modes.blind ? '答案已隐藏。' : '可随时暂停或跳到下一张。'}`);
    } catch(e) {
      if (token !== generation) return;
      audio.pause(); setState('between'); notice('播放失败：' + e.message + '。请点击下一张跳过，或重播重试。');
      addIssues([current.title + '：' + e.message]);
    }
  }
  function complete() {
    if(state !== 'playing') return;
    audio.pause();
    if(!gameActive) { next(true); return; }
    showAnswer();
    if(modes.auto) { gapRemaining = value('gap',300) * 1000; gapUntil = performance.now() + gapRemaining; setState('gap'); }
    else setState('between');
  }
  function next(natural = false) {
    if(warmActive) stopWarmup();
    if(!queue.length) { if(!gameActive) startMusic(); return; }
    if(position + 1 < queue.length) loadAt(position + 1);
    else if($('loop').checked && eligible().length) gameActive ? startRound() : startMusic();
    else if(!gameActive && !natural) loadAt(0);
    else if(gameActive) { gameActive = false; ++generation; audio.pause(); bounds = {start:0,end:Number.isFinite(audio.duration) ? audio.duration : 0}; setState('finished'); renderCurrent(); }
    else { ++generation; audio.pause(); setState('finished'); }
  }
  function stop() {
    if(warmActive) stopWarmup();
    gameActive = false; ++generation; if(cancelMetadata) cancelMetadata(); audio.pause();
    bounds = {start:0,end:Number.isFinite(audio.duration) ? audio.duration : 0};
    if(Number.isFinite(audio.duration)) audio.currentTime = 0;
    $('card').style.visibility = '';
    setState('idle'); renderCurrent();
  }
  async function toggle() {
    if(warmActive) stopWarmup();
    if (state === 'loading') return;
    if (state === 'playing' || state === 'gap') {
      resumeState = state; if (state === 'gap') gapRemaining = Math.max(0,gapUntil - performance.now());
      audio.pause(); setState('paused');
    } else if (state === 'paused') {
      if (resumeState === 'gap') { gapUntil = performance.now() + gapRemaining; setState('gap'); }
      else { const token = generation; try { await audio.play(); if (token === generation) setState('playing'); } catch(e) { notice('无法继续播放：' + e.message); } }
    } else if (state === 'between') next(); else if(gameActive) loadAt(Math.max(0,position)); else startMusic(current);
  }
  audio.addEventListener('ended',complete);
  audio.addEventListener('error',() => { if (state === 'playing' || state === 'paused') { audio.pause(); setState('between'); notice('音频播放中断，请重播或切换下一张。'); } });
  // performance.now keeps countdown independent of wall-clock changes. Never advance while paused.
  function updatePlayback() {
    if (state === 'playing' && audio.currentTime >= bounds.end - 0.025) complete();
    if (state === 'gap' && performance.now() >= gapUntil) next();
    applyFades();
    if(!backgrounded() && performance.now() - lastProgressUpdate >= 100) {
      lastProgressUpdate = performance.now(); renderProgress();
    }
    if(!backgrounded() && current && gameActive && modes.blind) {
      if(answerVisible() && !revealed) showAnswer();
    }
    syncPlaybackTimer();
  }
  for(const element of [audio,warmAudio]) {
    element.addEventListener('playing',syncPlaybackTimer);
    element.addEventListener('pause',syncPlaybackTimer);
    element.addEventListener('ended',syncPlaybackTimer);
  }
  audio.addEventListener('pause',() => { if (state === 'playing' && !audio.ended && audio.currentTime < bounds.end - 0.1) { resumeState = 'playing'; setState('paused'); } });
  $('seek').oninput = () => { if(warmActive) { if(Number.isFinite(warmAudio.duration)) warmAudio.currentTime = Math.min(warmAudio.duration,Number($('seek').value)); } else if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(bounds.end - 0.05,Math.max(bounds.start,Number($('seek').value))); renderProgress(); };
  $('play').onclick = toggle; $('next').onclick = () => next(); $('previous').onclick = () => { if (position > 0) loadAt(position - 1); };
  $('newRound').onclick = () => gameActive ? stop() : startRound();
  const toggleReveal = () => changeSetting('blind',!modes.blind);
  $('reveal').onclick = toggleReveal;
  $('search').oninput = renderSongs;
  $('selectAll').onclick = () => { const songs = visibleSongs(), all = songs.every(s => selected.has(s.id)); for (const s of songs) all ? selected.delete(s.id) : selected.add(s.id); renderSongs(); setState(state); };
  $('export').onclick = () => {
    const data = {app:'歌牌播放器',version:1,exportedAt:new Date().toISOString(),round,settings:preferences(),history};
    if(window.AndroidFiles && typeof window.AndroidFiles.saveText === 'function') {
      window.AndroidFiles.saveText(`karuta-session-${Date.now()}.json`,JSON.stringify(data,null,2));
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `karuta-session-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    notice('对局记录已导出（包含歌曲答案）。');
  };
  // Android's foreground service drives this clock even when page timers are throttled.
  function publishNativePlayback(force = false) {
    if(!window.AndroidPlayback) return;
    const now = performance.now();
    if(!force && now - nativePublishedAt < 750) return;
    const media = warmActive ? warmAudio : audio;
    const active = state === 'loading' || state === 'gap' || !media.paused;
    const data = JSON.stringify({active,available:active || state === 'paused' || warmActive,
      title: warmActive ? '热场音乐' : current ? (answerVisible() ? current.title : '未揭晓') : '歌牌播放器',
      subtitle: warmActive ? '五周年热场' : gameActive ? (state === 'gap' ? '牌间等待' : '歌牌游戏') : '音乐播放',
      duration:Number.isFinite(media.duration) ? media.duration : 0,position:media.currentTime || 0});
    nativePublishedAt = now;
    if(force || data !== nativePublished) { nativePublished = data; window.AndroidPlayback.update(data); }
  }
  window.karutaNativeHeartbeat = () => { updatePlayback(); publishNativePlayback(); };
  window.addEventListener('karuta-native-command',async event => {
    const command = event.detail;
    if(command === 'stop') stop();
    else if(command === 'next') next();
    else if(command === 'previous' && position > 0) loadAt(position - 1);
    else if(warmActive && (command === 'pause' || command === 'play')) {
      if(command === 'pause') warmAudio.pause();
      else { prepareAudio(); await warmAudio.play().catch(() => {}); }
    } else if(command === 'pause' && ['playing','gap'].includes(state)) toggle();
    else if(command === 'play' && !['playing','gap','loading'].includes(state)) await toggle();
    publishNativePlayback(true);
  });
  window.addEventListener('karuta-native-seek',event => {
    const media = warmActive ? warmAudio : audio, value = Number(event.detail);
    if(Number.isFinite(value) && Number.isFinite(media.duration)) {
      media.currentTime = warmActive ? Math.max(0,Math.min(media.duration,value)) : Math.max(bounds.start,Math.min(bounds.end - 0.05,value));
      publishNativePlayback(true);
    }
  });
  window.addEventListener('karuta-native-visibility',event => {
    nativeBackground = Boolean(event.detail);
    for(const orb of document.querySelectorAll('.ambient i')) for(const animation of orb.getAnimations()) backgrounded() ? animation.pause() : animation.play();
    if(backgrounded()) clearSpectrum();
    else { updatePlayback(); renderAnswer(); renderProgress(); startSpectrum(); }
  });
  window.addEventListener('karuta-native-error',event => notice(event.detail));
  for(const media of [audio,warmAudio]) for(const name of ['playing','pause','ended']) media.addEventListener(name,() => publishNativePlayback(true));
  window.addEventListener('karuta-native-pause',() => {
    if(warmActive) stopWarmup();
    if(state === 'playing' || state === 'gap') toggle();
  });
  document.addEventListener('keydown',e => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) || e.target.isContentEditable) return;
    const actions = {' ':toggle,ArrowRight:next,ArrowLeft:() => { if(position > 0) loadAt(position - 1); },a:toggleReveal};
    const action = actions[e.key] || actions[e.key.toLowerCase()]; if(action) { e.preventDefault(); action(); }
  });
  window.addEventListener('pagehide',() => { ++generation; stopWarmup(); release(); });
  for(const [id,key,label] of [['importButton','folder','加载曲包'],['playlistButton','list','播放列表'],['settingsButton','settings','读牌设置'],['autoShortcut','auto','游戏中全自动切歌'],['limitShortcut','tv','TVSize：随机起点限制 0–80 秒'],['reveal','eye','结束前揭晓'],['warmup','warm','播放热场音乐'],['previous','previous','上一首'],['next','next','下一首']]) iconButton(id,key,label);
  renderShortcuts(); renderPacks(); renderSongs(); renderCurrent(); setState('idle');
  finishStartup(window.karutaImportNativePacks());
})();
