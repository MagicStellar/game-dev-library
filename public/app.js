const get = (id) => document.getElementById(id);
const format = new Intl.NumberFormat('en-US');
const filters = get('filters');
const query = get('query');
const topic = get('topic');
const channel = get('channel');
const collection = get('collection');
const resultCount = get('results-count');
const results = get('results');
const player = get('player');
const screen = get('screen');
const previous = get('previous');
const next = get('next');
let page = 1;
let pageCount = 1;
let opener;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

const topicButtons = new Map();

async function request(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error('Library request failed');
  return response.json();
}

async function initialize() {
  try {
    const {topics, channels} = await request('/api/catalog');
    for (const [name, count] of [['', null], ...topics]) {
      if (name) topic.add(new Option(name, name));
      const label = name || 'All topics';
      const button = element('button', 'topic');
      button.type = 'button';
      button.append(element('span', '', label));
      if (count !== null) button.append(element('span', '', format.format(count)));
      button.addEventListener('click', () => {
        topic.value = topic.value === name ? '' : name;
        render(true);
      });
      topicButtons.set(name, button);
      get('topic-list').append(button);
    }
    for (const name of channels) channel.add(new Option(name, name));
    render(true);
  } catch {
    resultCount.textContent = 'Could not load the topic index. Refresh to try again.';
  }
}

function youtubeUrl(video) {
  return 'https://www.youtube.com/watch?v=' + video.id;
}

function duration(minutes) {
  if (minutes === null) return '';
  const total = Math.round(minutes * 60);
  const seconds = String(total % 60).padStart(2, '0');
  const wholeMinutes = Math.floor(total / 60);
  if (wholeMinutes < 60) return wholeMinutes + ':' + seconds;
  return Math.floor(wholeMinutes / 60) + ':' + String(wholeMinutes % 60).padStart(2, '0') + ':' + seconds;
}

function openVideo(video, trigger) {
  opener = trigger;
  get('player-topic').textContent = video.topic;
  get('player-title').textContent = video.title;
  get('player-info').textContent = [video.channel, video.kind, duration(video.minutes)].filter(Boolean).join(' · ');
  get('watch-link').href = youtubeUrl(video);
  const frame = element('iframe');
  frame.title = video.title;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  const params = new URLSearchParams({autoplay: '1', origin: location.origin, playsinline: '1'});
  frame.src = 'https://www.youtube.com/embed/' + video.id + '?' + params;
  screen.replaceChildren(frame);
  player.showModal();
}
player.addEventListener('close', () => {
  screen.replaceChildren();
  if (opener?.isConnected) opener.focus();
});

function card(video, eager) {
  const article = element('article', 'card');
  const poster = element('button', 'poster');
  poster.type = 'button';
  poster.setAttribute('aria-label', 'Play ' + video.title);
  poster.addEventListener('click', () => openVideo(video, poster));
  const image = element('img');
  image.alt = '';
  image.loading = eager ? 'eager' : 'lazy';
  image.decoding = 'async';
  function tryAlternate() {
    image.addEventListener('error', () => image.remove(), {once: true});
    image.src = '/thumbnail/' + video.id;
  }
  image.addEventListener('error', tryAlternate, {once: true});
  image.addEventListener('load', () => {
    // YouTube can return a tiny placeholder with HTTP 200.
    if (image.naturalWidth > 120) return;
    if (image.getAttribute('src').startsWith('/')) image.remove();
    else {
      image.removeEventListener('error', tryAlternate);
      tryAlternate();
    }
  });
  image.src = 'https://i.ytimg.com/vi/' + video.id + '/mqdefault.jpg';
  const play = element('span', 'play', '▶');
  play.setAttribute('aria-hidden', 'true');
  poster.append(image, play);
  if (video.minutes !== null) poster.append(element('span', 'length', duration(video.minutes)));
  const body = element('div', 'card-body');
  const title = element('h3', '');
  const titleButton = element('button', '', video.title);
  titleButton.type = 'button';
  titleButton.addEventListener('click', () => openVideo(video, titleButton));
  title.append(titleButton);
  body.append(element('p', 'category', video.topic), title, element('p', 'channel', video.channel));
  article.append(poster, body);
  return article;
}

let pending;
const filterFields = [
  [query, 'Search', () => query.value.trim()],
  [topic, 'Topic', () => topic.value],
  [channel, 'Channel', () => channel.value],
  [collection, 'Collection', () => collection.value ? collection.selectedOptions[0].text : '']
];

function renderActiveFilters() {
  const active = get('active-filters');
  active.replaceChildren();
  for (const [field, name, getLabel] of filterFields) {
    const label = getLabel();
    if (!label) continue;
    const button = element('button', 'filter-chip', label + ' ×');
    button.type = 'button';
    button.setAttribute('aria-label', 'Clear ' + name.toLowerCase() + ': ' + label);
    button.addEventListener('click', () => {
      field.value = '';
      field.focus();
      render(true);
    });
    active.append(button);
  }
}

async function render(resetPage = false, focusResults = false) {
  if (resetPage) page = 1;
  pending?.abort();
  const requestController = new AbortController();
  pending = requestController;
  for (const [name, button] of topicButtons) button.setAttribute('aria-pressed', String(topic.value === name));
  renderActiveFilters();
  const params = new URLSearchParams({q: query.value, topic: topic.value, channel: channel.value, collection: collection.value, page});
  try {
    const data = await request('/api/videos?' + params, requestController.signal);
    if (pending !== requestController) return;
    page = data.page;
    pageCount = data.pages;
    resultCount.textContent = data.total
      ? 'Showing ' + format.format(data.offset + 1) + '–' + format.format(data.offset + data.videos.length) + ' of ' + format.format(data.total) + (data.total === 1 ? ' video' : ' videos')
      : 'No videos found';
    get('ordering').hidden = !data.videos.some(video => video.rank !== null);
    results.replaceChildren(...data.videos.map((video, index) => card(video, index < 3)));
    if (!data.total) results.append(element('p', 'empty', 'Try a different keyword or clear the filters.'));
    get('pages').hidden = pageCount <= 1;
    get('page-number').textContent = 'Page ' + format.format(page) + ' of ' + format.format(pageCount);
    previous.disabled = page <= 1;
    next.disabled = page >= pageCount;
    if (focusResults) {
      resultCount.setAttribute('tabindex', '-1');
      resultCount.focus();
    }
  } catch {
    if (pending !== requestController) return;
    results.replaceChildren();
    get('pages').hidden = true;
    get('ordering').hidden = true;
    resultCount.textContent = 'Could not load videos. Refresh to try again.';
  }
}

let searchTimer;
query.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => render(true), 100);
});
for (const select of [topic, channel, collection]) select.addEventListener('change', () => render(true));
filters.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  render(true);
});
filters.addEventListener('reset', () => {
  clearTimeout(searchTimer);
  setTimeout(() => render(true), 0);
});

function changePage(delta) {
  const destination = page + delta;
  if (destination < 1 || destination > pageCount) return;
  page = destination;
  render(false, true);
}
previous.addEventListener('click', () => changePage(-1));
next.addEventListener('click', () => changePage(1));
if (location.protocol === 'file:') {
  resultCount.textContent = 'Run npm start in this project folder and open http://127.0.0.1:3000/.';
} else {
  initialize();
}
