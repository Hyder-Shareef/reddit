/**
 * ============================================================================
 * REDDIT MULTI-LANE DASHBOARD
 * Pure Vanilla JavaScript ES6
 * ============================================================================
 */

(() => {
  'use strict';

  // --------------------------------------------------------------------------
  // Constants & Configuration
  // --------------------------------------------------------------------------
  const STORAGE_KEY = 'reddit_multilane_dashboard_lanes_v1';
  const THEME_STORAGE_KEY = 'reddit_dashboard_theme';
  const DEFAULT_SUBREDDITS = ['learnprogramming', 'javascript'];
  const SUBREDDIT_REGEX = /^[a-zA-Z0-9_]{2,21}$/;
  const POST_LIMIT = 10;

  // --------------------------------------------------------------------------
  // Centralized Application State
  // --------------------------------------------------------------------------
  const state = {
    lanes: [], // Array of lane objects: { id, name, displayName, status, posts, error, abortController }
    openMenuLaneId: null,
    theme: 'dark'
  };

  // --------------------------------------------------------------------------
  // DOM Element References
  // --------------------------------------------------------------------------
  const elements = {
    lanesContainer: document.getElementById('lanes-container'),
    emptyState: document.getElementById('empty-state'),
    quickAddForm: document.getElementById('quick-add-form'),
    quickSubInput: document.getElementById('quick-sub-input'),
    quickAddBtn: document.getElementById('quick-add-btn'),
    openModalBtn: document.getElementById('open-modal-btn'),
    refreshAllBtn: document.getElementById('refresh-all-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    toastContainer: document.getElementById('toast-container'),
    emptyAddBtn: document.getElementById('empty-add-btn'),

    // Modal elements
    addModal: document.getElementById('add-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalAddForm: document.getElementById('modal-add-form'),
    modalSubInput: document.getElementById('modal-sub-input'),
    modalSubmitBtn: document.getElementById('modal-submit-btn'),
    modalErrorMsg: document.getElementById('modal-error-msg')
  };

  // --------------------------------------------------------------------------
  // Helper Utilities
  // --------------------------------------------------------------------------

  /**
   * Generates a unique ID for each lane
   */
  const generateId = () => `lane_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Sanitizes and normalizes a subreddit name input
   * Strips leading "r/", "/r/", trailing slashes, whitespace, and handles edge cases
   */
  const cleanSubredditName = (rawInput) => {
    if (!rawInput || typeof rawInput !== 'string') return '';
    let cleaned = rawInput.trim();
    // Strip leading /r/ or r/ (case-insensitive)
    cleaned = cleaned.replace(/^(\/?r\/)/i, '');
    // Strip trailing slashes
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned.trim();
  };

  /**
   * Validates subreddit name according to Reddit conventions
   * Must be 2-21 alphanumeric characters or underscores
   */
  const isValidSubreddit = (name) => {
    return SUBREDDIT_REGEX.test(name);
  };

  /**
   * Formats upvote scores (e.g. 14200 -> 14.2k)
   */
  const formatScore = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return num.toLocaleString();
  };

  /**
   * Formats relative time (e.g. "3h ago")
   */
  const formatTimeAgo = (utcSeconds) => {
    if (!utcSeconds) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - utcSeconds);

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
    return `${Math.floor(diff / 31536000)}y ago`;
  };

  /**
   * Checks if a thumbnail URL is a valid image URL
   */
  const isValidThumbnail = (url) => {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    if (['default', 'self', 'nsfw', 'spoiler', '', 'image'].includes(lower)) return false;
    return lower.startsWith('http://') || lower.startsWith('https://');
  };

  /**
   * HTML escape utility to prevent XSS
   */
  const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // --------------------------------------------------------------------------
  // Toast Notifications
  // --------------------------------------------------------------------------
  const showToast = (message, type = 'info') => {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHTML(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3500);
  };

  // --------------------------------------------------------------------------
  // LocalStorage Persistence
  // --------------------------------------------------------------------------

  /**
   * Loads saved subreddit names from localStorage with fallback handling
   */
  const loadStoredSubreddits = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(name => typeof name === 'string' && isValidSubreddit(cleanSubredditName(name)));
      }
      return [];
    } catch (err) {
      console.warn('Failed to parse stored subreddits from localStorage:', err);
      return null;
    }
  };

  /**
   * Persists current active subreddit names to localStorage
   */
  const persistLanes = () => {
    try {
      const names = state.lanes.map(lane => lane.name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    } catch (err) {
      console.error('Failed to save subreddits to localStorage:', err);
    }
  };

  // --------------------------------------------------------------------------
  // Reddit API Service
  // --------------------------------------------------------------------------

  /**
   * Fetches hot posts for a subreddit using Reddit's public JSON API.
   * Endpoint: https://www.reddit.com/r/{subreddit}/hot.json?limit=10
   * Includes fallback proxy handling if direct fetch is blocked by CORS/network.
   */
  const fetchRedditPosts = async (subreddit, signal) => {
    const primaryUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${POST_LIMIT}`;

    const executeFetch = async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`r/${subreddit} does not exist or has been banned.`);
        }
        if (response.status === 403) {
          throw new Error(`r/${subreddit} is private or restricted.`);
        }
        if (response.status === 429) {
          throw new Error('Reddit API rate limit exceeded. Please wait a moment and retry.');
        }
        throw new Error(`Reddit API returned status ${response.status}.`);
      }

      const json = await response.json();
      return json;
    };

    let data;
    try {
      data = await executeFetch(primaryUrl);
    } catch (primaryError) {
      // If aborted by user action, rethrow immediately
      if (primaryError.name === 'AbortError') {
        throw primaryError;
      }

      // If direct fetch threw a TypeError (network failure or CORS blocking in browser),
      // attempt safe proxy fallback so the user still gets live data reliably!
      if (primaryError instanceof TypeError || primaryError.message.includes('Failed to fetch')) {
        try {
          const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(primaryUrl)}`;
          data = await executeFetch(fallbackUrl);
        } catch (fallbackError) {
          // If fallback also fails, throw user-friendly network error
          throw new Error('Network error or Reddit service unreachable. Click Retry to try again.');
        }
      } else {
        throw primaryError;
      }
    }

    // Process & normalize Reddit API payload
    if (!data || !data.data || !Array.isArray(data.data.children)) {
      throw new Error(`Unable to read posts for r/${subreddit}.`);
    }

    const posts = data.data.children
      .map(child => child.data)
      .filter(d => Boolean(d && d.title))
      .slice(0, POST_LIMIT)
      .map(d => {
        const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url || '#');
        return {
          id: d.id,
          title: d.title || 'Untitled Post',
          author: d.author || '[deleted]',
          score: typeof d.score === 'number' ? d.score : (d.ups || 0),
          numComments: d.num_comments || 0,
          permalink: permalink,
          externalUrl: d.url || permalink,
          thumbnail: isValidThumbnail(d.thumbnail) ? d.thumbnail : null,
          createdUtc: d.created_utc || null,
          flairText: d.link_flair_text || null
        };
      });

    return posts;
  };

  // --------------------------------------------------------------------------
  // Template Generators (Pure HTML strings)
  // --------------------------------------------------------------------------

  /**
   * Generates Skeleton Loading Cards HTML with pulsing shimmer
   */
  const renderSkeletonCards = (count = 4) => {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-card" aria-hidden="true">
          <div class="skeleton-score"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line w-80"></div>
            <div class="skeleton-line w-100"></div>
            <div class="skeleton-line w-50"></div>
          </div>
        </div>
      `;
    }
    return html;
  };

  /**
   * Generates a Single Post Card HTML
   */
  const renderPostCard = (post) => {
    const formattedScore = formatScore(post.score);
    const formattedComments = formatScore(post.numComments);
    const timeAgo = formatTimeAgo(post.createdUtc);
    const flairBadge = post.flairText
      ? `<span class="post-flair" title="${escapeHTML(post.flairText)}">${escapeHTML(post.flairText)}</span>`
      : '';

    const thumbnailHtml = post.thumbnail
      ? `<img class="post-thumbnail" src="${escapeHTML(post.thumbnail)}" alt="Post thumbnail" loading="lazy" onerror="this.style.display='none'">`
      : '';

    return `
      <article class="post-card" data-post-id="${escapeHTML(post.id)}">
        <!-- Upvote Score Column (Matching Wireframe) -->
        <div class="post-upvotes" aria-label="${post.score} upvotes">
          <svg class="upvote-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-8 8h5v8h6v-8h5z"/>
          </svg>
          <span class="upvote-score">${formattedScore}</span>
        </div>

        <!-- Post Content Column -->
        <div class="post-details">
          <div class="post-meta-top">
            <span class="post-author">u/${escapeHTML(post.author)}</span>
            ${timeAgo ? `<span class="post-time">• ${timeAgo}</span>` : ''}
            ${flairBadge}
          </div>

          <div class="post-media-row">
            <a 
              href="${escapeHTML(post.permalink)}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="post-title-link"
              title="${escapeHTML(post.title)}"
            >
              ${escapeHTML(post.title)}
            </a>
            ${thumbnailHtml}
          </div>

          <div class="post-meta-bottom">
            <span class="post-comments">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              ${formattedComments} comments
            </span>
            <a 
              href="${escapeHTML(post.permalink)}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="post-external-link"
              title="Open post on Reddit"
            >
              <span>Reddit</span>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      </article>
    `;
  };

  /**
   * Generates Lane Inner Body HTML according to lane status
   */
  const renderLaneBodyContent = (lane) => {
    if (lane.status === 'loading') {
      return renderSkeletonCards(5);
    }

    if (lane.status === 'error') {
      return `
        <div class="lane-state-message">
          <div class="state-icon-wrapper error">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h4>Failed to load feed</h4>
          <p>${escapeHTML(lane.error || 'Unable to fetch posts.')}</p>
          <button class="btn btn-secondary btn-retry" data-lane-id="${escapeHTML(lane.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Retry
          </button>
        </div>
      `;
    }

    if (lane.status === 'success') {
      if (!lane.posts || lane.posts.length === 0) {
        return `
          <div class="lane-state-message">
            <div class="state-icon-wrapper">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            </div>
            <h4>No Posts Found</h4>
            <p>There are no hot posts currently available in this subreddit.</p>
            <button class="btn btn-secondary btn-retry" data-lane-id="${escapeHTML(lane.id)}">Refresh</button>
          </div>
        `;
      }
      return lane.posts.map(renderPostCard).join('');
    }

    return '';
  };

  /**
   * Generates Complete Lane DOM Element
   */
  const createLaneElement = (lane) => {
    const laneEl = document.createElement('section');
    laneEl.className = 'lane';
    laneEl.id = lane.id;
    laneEl.dataset.subreddit = lane.name;

    const countBadge = lane.posts && lane.posts.length > 0 ? `${lane.posts.length} posts` : 'r/';

    laneEl.innerHTML = `
      <!-- Lane Header (Matching Wireframe) -->
      <header class="lane-header">
        <div class="lane-header-left">
          <a 
            href="https://www.reddit.com/r/${escapeHTML(lane.name)}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="lane-title" 
            title="r/${escapeHTML(lane.name)} on Reddit"
          >
            /r/${escapeHTML(lane.displayName || lane.name)}
          </a>
          <span class="lane-badge" id="badge-${escapeHTML(lane.id)}">${countBadge}</span>
        </div>

        <div class="lane-header-right">
          <!-- 3-Dots Menu Button matching wireframe -->
          <button 
            type="button" 
            class="btn-menu-trigger" 
            data-lane-id="${escapeHTML(lane.id)}" 
            title="Lane options" 
            aria-label="Lane options for r/${escapeHTML(lane.name)}"
            aria-haspopup="true"
            aria-expanded="false"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>

          <!-- Dropdown Menu with Refresh and Delete -->
          <div class="lane-menu-dropdown hidden" id="dropdown-${escapeHTML(lane.id)}" role="menu">
            <button type="button" class="dropdown-item btn-lane-refresh" data-lane-id="${escapeHTML(lane.id)}" role="menuitem">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>Refresh</span>
            </button>
            <div class="dropdown-divider"></div>
            <button type="button" class="dropdown-item dropdown-danger btn-lane-remove" data-lane-id="${escapeHTML(lane.id)}" role="menuitem">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Scrollable Lane Content -->
      <div class="lane-body" id="body-${escapeHTML(lane.id)}">
        ${renderLaneBodyContent(lane)}
      </div>
    `;

    return laneEl;
  };

  /**
   * Generates the "+ Add Subreddit" placeholder card at the end of lanes
   */
  const createAddLaneCard = () => {
    const card = document.createElement('div');
    card.className = 'add-lane-card';
    card.id = 'add-lane-card-btn';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', 'Add a new subreddit lane');
    card.innerHTML = `
      <div class="add-circle-btn" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <span>Add Subreddit</span>
    `;
    return card;
  };

  // --------------------------------------------------------------------------
  // Core State Actions (Add, Remove, Refresh)
  // --------------------------------------------------------------------------

  /**
   * Fetches data for a specific lane and updates its DOM in-place
   */
  const fetchLaneData = async (laneId) => {
    const lane = state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    // Abort previous in-flight request if any to avoid race conditions
    if (lane.abortController) {
      lane.abortController.abort();
    }
    lane.abortController = new AbortController();

    // Update state to loading
    lane.status = 'loading';
    lane.error = null;

    // Update only this lane's DOM
    const bodyEl = document.getElementById(`body-${lane.id}`);
    const badgeEl = document.getElementById(`badge-${lane.id}`);
    if (bodyEl) {
      bodyEl.innerHTML = renderLaneBodyContent(lane);
    }
    if (badgeEl) {
      badgeEl.textContent = 'loading...';
    }

    try {
      const posts = await fetchRedditPosts(lane.name, lane.abortController.signal);
      lane.posts = posts;
      lane.status = 'success';
      lane.error = null;

      if (bodyEl) {
        bodyEl.innerHTML = renderLaneBodyContent(lane);
      }
      if (badgeEl) {
        badgeEl.textContent = `${posts.length} posts`;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Request was cleanly cancelled

      console.warn(`Error fetching posts for r/${lane.name}:`, err);
      lane.status = 'error';
      lane.error = err.message || 'Failed to fetch posts';

      if (bodyEl) {
        bodyEl.innerHTML = renderLaneBodyContent(lane);
      }
      if (badgeEl) {
        badgeEl.textContent = 'error';
      }
    } finally {
      lane.abortController = null;
    }
  };

  /**
   * Adds a new subreddit lane to dashboard
   */
  const addLane = async (rawName) => {
    const cleanName = cleanSubredditName(rawName);

    // 1. Validation
    if (!cleanName) {
      showToast('Please enter a subreddit name.', 'error');
      return false;
    }

    if (!isValidSubreddit(cleanName)) {
      showToast('Invalid subreddit name. Use letters, numbers, and underscores (2-21 chars).', 'error');
      return false;
    }

    // 2. Prevent Duplicates (Case-insensitive)
    const isDuplicate = state.lanes.some(
      l => l.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (isDuplicate) {
      showToast(`r/${cleanName} is already on your dashboard.`, 'info');
      // Scroll to existing lane
      const existingLane = state.lanes.find(l => l.name.toLowerCase() === cleanName.toLowerCase());
      if (existingLane) {
        const laneEl = document.getElementById(existingLane.id);
        if (laneEl) {
          laneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
      return false;
    }

    // 3. Create Lane Model
    const newLane = {
      id: generateId(),
      name: cleanName.toLowerCase(),
      displayName: cleanName,
      status: 'loading',
      posts: [],
      error: null,
      abortController: null
    };

    state.lanes.push(newLane);
    persistLanes();
    updateEmptyStateVisibility();

    // 4. Render lane DOM element before the "+ Add Subreddit" placeholder card
    const laneElement = createLaneElement(newLane);
    const addCard = document.getElementById('add-lane-card-btn');
    if (addCard) {
      elements.lanesContainer.insertBefore(laneElement, addCard);
    } else {
      elements.lanesContainer.appendChild(laneElement);
    }

    // Smooth scroll to the newly created lane
    laneElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });

    // 5. Trigger async fetch for this lane independently
    fetchLaneData(newLane.id);
    return true;
  };

  /**
   * Removes a lane from the dashboard with smooth exit animation
   */
  const removeLane = (laneId) => {
    const laneIndex = state.lanes.findIndex(l => l.id === laneId);
    if (laneIndex === -1) return;

    const lane = state.lanes[laneIndex];

    // Cancel in-flight request if any
    if (lane.abortController) {
      lane.abortController.abort();
    }

    // Remove from state
    state.lanes.splice(laneIndex, 1);
    persistLanes();

    // Close any active menu
    closeActiveMenu();

    // Animate removal in DOM
    const laneEl = document.getElementById(laneId);
    if (laneEl) {
      laneEl.classList.add('lane-removing');
      laneEl.addEventListener('animationend', () => {
        laneEl.remove();
        updateEmptyStateVisibility();
      }, { once: true });
    } else {
      updateEmptyStateVisibility();
    }

    showToast(`Removed r/${lane.displayName || lane.name}`, 'info');
  };

  /**
   * Refreshes a single lane's posts
   */
  const refreshLane = (laneId) => {
    closeActiveMenu();
    fetchLaneData(laneId);
  };

  /**
   * Refreshes all active lanes concurrently
   */
  const refreshAllLanes = () => {
    if (state.lanes.length === 0) return;
    showToast('Refreshing all subreddit lanes...', 'info');
    state.lanes.forEach(lane => {
      fetchLaneData(lane.id);
    });
  };

  // --------------------------------------------------------------------------
  // UI & Menu Interactions
  // --------------------------------------------------------------------------

  /**
   * Toggles the 3-dots dropdown menu for a specific lane
   */
  const toggleLaneMenu = (laneId) => {
    const dropdown = document.getElementById(`dropdown-${laneId}`);
    const trigger = document.querySelector(`.btn-menu-trigger[data-lane-id="${laneId}"]`);

    if (!dropdown || !trigger) return;

    const isCurrentlyOpen = state.openMenuLaneId === laneId;

    // Close previously open menu
    closeActiveMenu();

    if (!isCurrentlyOpen) {
      dropdown.classList.remove('hidden');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      state.openMenuLaneId = laneId;
    }
  };

  /**
   * Closes any currently open dropdown menu
   */
  const closeActiveMenu = () => {
    if (!state.openMenuLaneId) return;

    const dropdown = document.getElementById(`dropdown-${state.openMenuLaneId}`);
    const trigger = document.querySelector(`.btn-menu-trigger[data-lane-id="${state.openMenuLaneId}"]`);

    if (dropdown) dropdown.classList.add('hidden');
    if (trigger) {
      trigger.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
    }

    state.openMenuLaneId = null;
  };

  /**
   * Updates display of empty dashboard state vs lanes container
   */
  const updateEmptyStateVisibility = () => {
    const hasLanes = state.lanes.length > 0;
    if (hasLanes) {
      elements.emptyState.classList.add('hidden');
      elements.lanesContainer.classList.remove('hidden');

      // Ensure "+ Add Subreddit" placeholder card is present
      if (!document.getElementById('add-lane-card-btn')) {
        elements.lanesContainer.appendChild(createAddLaneCard());
      }
    } else {
      elements.emptyState.classList.remove('hidden');
      elements.lanesContainer.classList.add('hidden');
    }
  };

  // --------------------------------------------------------------------------
  // Modal Management
  // --------------------------------------------------------------------------

  const openAddModal = () => {
    elements.addModal.classList.remove('hidden');
    elements.modalSubInput.value = '';
    elements.modalSubmitBtn.disabled = true;
    elements.modalErrorMsg.textContent = '';
    elements.modalErrorMsg.classList.add('hidden');
    setTimeout(() => elements.modalSubInput.focus(), 50);
  };

  const closeAddModal = () => {
    elements.addModal.classList.add('hidden');
    elements.modalSubInput.value = '';
    elements.modalErrorMsg.textContent = '';
    elements.modalErrorMsg.classList.add('hidden');
  };

  // --------------------------------------------------------------------------
  // Theme Management
  // --------------------------------------------------------------------------

  const initTheme = () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
  };

  const toggleTheme = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  };

  // --------------------------------------------------------------------------
  // Event Delegation & Listeners Setup
  // --------------------------------------------------------------------------

  const setupEventListeners = () => {
    // 1. Quick Add Form in Header
    elements.quickSubInput.addEventListener('input', (e) => {
      const clean = cleanSubredditName(e.target.value);
      elements.quickAddBtn.disabled = !isValidSubreddit(clean);
    });

    elements.quickAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = elements.quickSubInput.value;
      const success = await addLane(val);
      if (success) {
        elements.quickSubInput.value = '';
        elements.quickAddBtn.disabled = true;
        elements.quickSubInput.blur();
      }
    });

    // 2. Add Modal Form & Buttons
    elements.openModalBtn.addEventListener('click', openAddModal);
    elements.closeModalBtn.addEventListener('click', closeAddModal);
    elements.modalCancelBtn.addEventListener('click', closeAddModal);

    elements.modalSubInput.addEventListener('input', (e) => {
      const clean = cleanSubredditName(e.target.value);
      const valid = isValidSubreddit(clean);
      elements.modalSubmitBtn.disabled = !valid;

      if (clean && !valid) {
        elements.modalErrorMsg.textContent = 'Subreddit names must be 2-21 alphanumeric chars or underscores.';
        elements.modalErrorMsg.classList.remove('hidden');
      } else {
        elements.modalErrorMsg.textContent = '';
        elements.modalErrorMsg.classList.add('hidden');
      }
    });

    elements.modalAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = elements.modalSubInput.value;
      const success = await addLane(val);
      if (success) {
        closeAddModal();
      }
    });

    // Close modal on backdrop click
    elements.addModal.addEventListener('click', (e) => {
      if (e.target === elements.addModal) {
        closeAddModal();
      }
    });

    // 3. Global Header Actions
    elements.refreshAllBtn.addEventListener('click', refreshAllLanes);
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // 4. Empty State Actions
    elements.emptyAddBtn.addEventListener('click', openAddModal);

    // Suggestion pills in empty state
    elements.emptyState.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('.tag-btn');
      if (tagBtn && tagBtn.dataset.sub) {
        addLane(tagBtn.dataset.sub);
      }
    });

    // 5. Lanes Container Event Delegation (Handles menus, refresh, delete, retry, add-card)
    elements.lanesContainer.addEventListener('click', (e) => {
      // "+ Add Subreddit" card click
      const addCard = e.target.closest('#add-lane-card-btn');
      if (addCard) {
        openAddModal();
        return;
      }

      // 3-Dots Menu Trigger Click
      const menuTrigger = e.target.closest('.btn-menu-trigger');
      if (menuTrigger) {
        e.stopPropagation();
        const laneId = menuTrigger.dataset.laneId;
        toggleLaneMenu(laneId);
        return;
      }

      // Menu Action: Refresh Click
      const refreshBtn = e.target.closest('.btn-lane-refresh');
      if (refreshBtn) {
        e.stopPropagation();
        const laneId = refreshBtn.dataset.laneId;
        refreshLane(laneId);
        return;
      }

      // Menu Action: Delete/Remove Click
      const removeBtn = e.target.closest('.btn-lane-remove');
      if (removeBtn) {
        e.stopPropagation();
        const laneId = removeBtn.dataset.laneId;
        removeLane(laneId);
        return;
      }

      // Inline Retry Button Click
      const retryBtn = e.target.closest('.btn-retry');
      if (retryBtn) {
        e.stopPropagation();
        const laneId = retryBtn.dataset.laneId;
        refreshLane(laneId);
        return;
      }
    });

    // 6. Close dropdown menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.lane-header-right')) {
        closeActiveMenu();
      }
    });

    // 7. Keyboard Accessibility & Shortcuts
    document.addEventListener('keydown', (e) => {
      // If user is currently typing in an input, handle only Escape
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          if (!elements.addModal.classList.contains('hidden')) {
            closeAddModal();
          } else {
            e.target.blur();
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        if (!elements.addModal.classList.contains('hidden')) {
          closeAddModal();
        } else if (state.openMenuLaneId) {
          closeActiveMenu();
        }
      } else if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        elements.quickSubInput.focus();
        elements.quickSubInput.select();
      } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openAddModal();
      }
    });

    // 8. Desktop Horizontal Deck Scrolling with Mouse Wheel
    elements.lanesContainer.addEventListener('wheel', (e) => {
      const laneBody = e.target.closest('.lane-body');
      // If cursor is outside a lane body (e.g. on header or lane edges),
      // or if lane body cannot be scrolled vertically, scroll deck horizontally
      if (!laneBody || (laneBody.scrollHeight <= laneBody.clientHeight)) {
        if (e.deltaY !== 0) {
          e.preventDefault();
          elements.lanesContainer.scrollLeft += e.deltaY;
        }
      }
    }, { passive: false });
  };

  // --------------------------------------------------------------------------
  // Application Bootstrap
  // --------------------------------------------------------------------------

  const initApp = async () => {
    // 1. Initialize Theme
    initTheme();

    // 2. Setup Event Listeners
    setupEventListeners();

    // 3. Restore Lanes from LocalStorage or Load Defaults
    const stored = loadStoredSubreddits();
    const initialSubreddits = stored !== null ? stored : DEFAULT_SUBREDDITS;

    if (initialSubreddits.length === 0) {
      updateEmptyStateVisibility();
      return;
    }

    // 4. Initialize Lane Models
    state.lanes = initialSubreddits.map(name => ({
      id: generateId(),
      name: name.toLowerCase(),
      displayName: name,
      status: 'loading',
      posts: [],
      error: null,
      abortController: null
    }));

    // 5. Populate DOM
    elements.lanesContainer.innerHTML = '';
    state.lanes.forEach(lane => {
      elements.lanesContainer.appendChild(createLaneElement(lane));
    });

    // Append "+ Add Subreddit" placeholder card at the end
    elements.lanesContainer.appendChild(createAddLaneCard());

    updateEmptyStateVisibility();

    // 6. Fetch posts concurrently for all initial lanes
    state.lanes.forEach(lane => {
      fetchLaneData(lane.id);
    });
  };

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
