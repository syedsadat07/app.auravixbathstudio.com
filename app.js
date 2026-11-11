const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const toast = $('.toast');
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

const sidebar = $('#sidebar');
const mobileMenu = $('.mobile-menu');
const sidebarClose = $('.sidebar-close');
function toggleSidebar(open) {
  sidebar.classList.toggle('is-open', open);
  mobileMenu.setAttribute('aria-expanded', String(open));
}
mobileMenu.addEventListener('click', () => toggleSidebar(!sidebar.classList.contains('is-open')));
sidebarClose.addEventListener('click', () => toggleSidebar(false));

function setActiveSection(section) {
  $$('.side-link[data-section]').forEach(link => {
    link.classList.toggle('is-active', link.dataset.section === section);
  });
}

$$('.side-link[data-section]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const section = link.dataset.section;
  setActiveSection(section);
  if (section !== 'Dashboard') showToast(`${section} is ready to connect to your workflow.`);
  if (section === 'Dashboard') window.scrollTo({ top: 0, behavior: 'smooth' });
  toggleSidebar(false);
}));

const dateLabels = ['01 Jun – 09 Nov, 2026', '01 May – 31 May, 2026', '01 Sep – 09 Nov, 2026'];
let dateIndex = 0;
$('#date-control').addEventListener('click', () => {
  dateIndex = (dateIndex + 1) % dateLabels.length;
  $('#date-label').textContent = dateLabels[dateIndex];
  showToast(`Showing ${dateIndex === 0 ? 'the current range' : 'a different date range'}.`);
});

const monthlyBars = [43, 67, 50, 84, 59, 67];
const annualBars = [42, 57, 68, 74, 82, 93];
function setPeakLabel(index) {
  $$('.bar-value').forEach((value, valueIndex) => { value.style.opacity = valueIndex === index ? '1' : '0'; });
}
setPeakLabel(3);
$$('.segment').forEach(button => button.addEventListener('click', () => {
  const annual = button.dataset.range === 'annually';
  $$('.segment').forEach(item => item.classList.toggle('is-active', item === button));
  $$('.bar-column i').forEach((bar, index) => {
    bar.style.height = `${(annual ? annualBars : monthlyBars)[index]}%`;
    bar.classList.toggle('is-peak', index === (annual ? 5 : 3));
  });
  setPeakLabel(annual ? 5 : 3);
  $$('.bar-value').forEach((value, index) => { value.textContent = annual ? [42, 58, 69, 75, 84, 96][index] : [5, 8, 6, 10, 7, 8][index]; });
  $('#lead-total').textContent = annual ? '84' : '44';
  showToast(`Showing ${annual ? 'annual' : 'monthly'} lead engagement.`);
}));

// Search is intentionally global for the compact dashboard: it filters the visible lead activity table.
const searchButton = $('.topbar .icon-button');
const searchInput = document.createElement('input');
searchInput.type = 'search';
searchInput.className = 'global-search-input';
searchInput.placeholder = 'Search leads';
searchButton.addEventListener('click', () => {
  if (!searchInput.isConnected) {
    searchButton.replaceWith(searchInput);
    searchInput.focus();
  } else {
    searchInput.focus();
  }
});
function filterActivity(value) {
  const query = value.trim().toLowerCase();
  let visible = 0;
  $$('#activity-rows tr').forEach(row => {
    const match = !query || row.dataset.search.includes(query);
    row.hidden = !match;
    if (match) visible += 1;
  });
  $('#empty-activity').classList.toggle('is-visible', visible === 0);
}
searchInput.addEventListener('input', event => filterActivity(event.target.value));
$$('.activity-card .text-action').forEach(button => button.addEventListener('click', () => showToast('Showing all recent lead activity.')));

$$('.text-action, .more-button').forEach(button => {
  if (button.closest('.activity-card')) return;
  button.addEventListener('click', () => showToast('This workspace view is ready to connect.'));
});
$('#goal-task').addEventListener('click', () => showToast('New task action is ready to connect.'));
$('#goal-add-lead').addEventListener('click', () => setModal(true));

const modal = $('#lead-modal');
function setModal(open) {
  modal.classList.toggle('is-visible', open);
  modal.setAttribute('aria-hidden', String(!open));
  if (open) setTimeout(() => $('input', modal).focus(), 50);
}
$('#new-lead').addEventListener('click', () => setModal(true));
$('#close-modal').addEventListener('click', () => setModal(false));
$('#cancel-modal').addEventListener('click', () => setModal(false));
modal.addEventListener('click', event => { if (event.target === modal) setModal(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setModal(false); });
$('#lead-form').addEventListener('submit', event => {
  event.preventDefault();
  const customer = new FormData(event.currentTarget).get('customer');
  event.currentTarget.reset();
  setModal(false);
  showToast(`Lead started for ${customer}.`);
});
