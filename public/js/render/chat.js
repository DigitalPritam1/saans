/**
 * Saans (साँस) - Ask Saans Chat Screen Renderer
 *
 * Implements:
 * - Bounded card container (max-width 760px, centered)
 * - Compact empty state at top with suggestion chips directly under it
 * - Pinned composer at bottom of card (sits above mobile bottom tab bar)
 * - Clean chat layout: user bubbles right, assistant left with avatar mark
 * - Typing indicator (3 dots, reduced-motion safe)
 * - Segmented language switch: "English | हिंदी | मराठी" with proper lang attributes
 * - Auto-growing textarea, character counter, Enter to send, Shift+Enter newline
 * - Safe formatted text (paragraphs and bullet lists with HTML escaping)
 */

import { icon } from '../ui/icons.js';

/**
 * Escapes raw text and converts simple markdown paragraphs and lists into safe HTML
 */
export function formatSafeMarkdown(text = '') {
  if (!text) return '';

  // 1. Escape HTML
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Split into blocks by double newlines
  const blocks = escaped.split(/\n\s*\n/);

  return blocks.map(block => {
    const lines = block.trim().split('\n');
    // Check if block is a bullet list
    const isList = lines.every(l => /^\s*[-*•]\s+/.test(l));
    if (isList) {
      const items = lines.map(l => `<li>${l.replace(/^\s*[-*•]\s+/, '')}</li>`).join('');
      return `<ul class="chat-list">${items}</ul>`;
    }
    // Numbered list
    const isNumbered = lines.every(l => /^\s*\d+\.\s+/.test(l));
    if (isNumbered) {
      const items = lines.map(l => `<li>${l.replace(/^\s*\d+\.\s+/, '')}</li>`).join('');
      return `<ol class="chat-list">${items}</ol>`;
    }

    return `<p class="chat-para">${lines.join('<br>')}</p>`;
  }).join('');
}

/**
 * Generates dynamic prompt suggestion chips
 */
export function getPromptSuggestions(aqi = 300, profile = {}, lang = 'en') {
  const hasKids = profile.household?.includes('kids') || profile.household?.includes('infant');
  const isSevere = aqi > 300;

  if (lang === 'hi') {
    if (hasKids) {
      return [
        'क्या आज शाम बच्चों को बाहर खेलने भेजना सुरक्षित है?',
        'घर के कमरों में स्मॉग कम करने के सबसे आसान उपाय क्या हैं?',
        'बच्चों के लिए किस प्रकार का मास्क सबसे सही रहता है?'
      ];
    }
    return [
      'आज के समय बाहर टहलने का सबसे सही वक्त क्या है?',
      'खिड़कियाँ और दरवाजे किस समय खोलना ठीक रहेगा?',
      'स्मॉग के दौरान खान-पान और श्वसन सुरक्षा के लिए क्या करें?'
    ];
  }

  if (lang === 'mr') {
    return [
      'आज संध्याकाळी घराबाहेर फिरायला जाणे सुरक्षित आहे का?',
      'घरातील हवा स्वच्छ ठेवण्यासाठी काय उपाय करावेत?',
      'स्मॉगपासून वाचण्यासाठी कोणता मास्क वापरावा?'
    ];
  }

  // English
  if (hasKids && isSevere) {
    return [
      'Is it safe for my child to play outdoors this evening?',
      'How to seal balcony door gaps with a damp towel?',
      'What size N95 mask is appropriate for school children?'
    ];
  }

  if (isSevere) {
    return [
      'When is the cleanest forecast hour to run essential errands?',
      'Does running our bedroom purifier on auto protect vulnerable lungs?',
      'How to ventilate kitchen fumes without letting outdoor smog in?'
    ];
  }

  return [
    'What are the best hours today for an outdoor jog?',
    'Should we open windows for afternoon cross-ventilation?',
    'How do plants and air purifiers compare for PM2.5 reduction?'
  ];
}

/**
 * Renders the Ask Saans Screen (Item 14: Bounded 760px card, compact top empty state, pinned bottom composer)
 */
export function renderChatScreen(messages = [], { currentLang = 'en', aqi = 300, profile = {}, isSending = false }) {
  const suggestions = getPromptSuggestions(aqi, profile, currentLang);

  const langSegment = `
    <div class="lang-switch-segment" role="radiogroup" aria-label="Select chat language">
      <button
        type="button"
        class="lang-btn ${currentLang === 'en' ? 'lang-btn-active' : ''}"
        data-lang="en"
        role="radio"
        aria-checked="${currentLang === 'en'}"
      >
        English
      </button>
      <button
        type="button"
        class="lang-btn ${currentLang === 'hi' ? 'lang-btn-active' : ''}"
        data-lang="hi"
        role="radio"
        aria-checked="${currentLang === 'hi'}"
      >
        हिंदी
      </button>
      <button
        type="button"
        class="lang-btn ${currentLang === 'mr' ? 'lang-btn-active' : ''}"
        data-lang="mr"
        role="radio"
        aria-checked="${currentLang === 'mr'}"
      >
        मराठी
      </button>
    </div>
  `;

  const suggestionsMarkup = `
    <div class="chat-suggestions-row" aria-label="Suggested questions">
      ${suggestions.map(s => `
        <button type="button" class="suggestion-chip" data-prompt="${encodeURIComponent(s)}">
          ${s}
        </button>
      `).join('')}
    </div>
  `;

  const messagesMarkup = messages.map(msg => {
    const isUser = msg.role === 'user';
    const langAttr = msg.lang ? `lang="${msg.lang}"` : '';

    return `
      <div class="chat-message-row ${isUser ? 'msg-user-row' : 'msg-bot-row'}">
        ${!isUser ? `<div class="msg-avatar">${icon('wind', 18)}</div>` : ''}
        <div class="msg-bubble ${isUser ? 'bubble-user' : 'bubble-bot'}" ${langAttr}>
          ${isUser ? `<p class="chat-para">${msg.text}</p>` : formatSafeMarkdown(msg.text)}
          ${msg.time ? `<span class="msg-time">${msg.time}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const typingIndicator = isSending ? `
    <div class="chat-message-row msg-bot-row typing-row" aria-label="Saans is typing">
      <div class="msg-avatar">${icon('wind', 18)}</div>
      <div class="msg-bubble bubble-bot typing-bubble">
        <span class="dot dot-1"></span>
        <span class="dot dot-2"></span>
        <span class="dot dot-3"></span>
      </div>
    </div>
  ` : '';

  const placeholderText = currentLang === 'hi'
    ? 'यहाँ अपना प्रश्न लिखें (Enter दबाएँ)...'
    : currentLang === 'mr'
      ? 'येथे तुमचा प्रश्न विचारा...'
      : 'Ask about masks, purifier settings, or walks (Enter to send)...';

  return `
    <div class="chat-screen-wrap">
      <div class="chat-header">
        <div>
          <h1 class="screen-title">Ask Saans</h1>
          <p class="screen-subtitle">Environmental health assistant for Indian homes</p>
        </div>
        ${langSegment}
      </div>

      <!-- Item 14: Bounded card container (max 760px, pinned composer) -->
      <div class="chat-card-container">
        <div class="chat-conversation-area" id="chat-messages-container" role="log" aria-live="polite">
          ${messages.length === 0 ? `
            <div class="chat-empty-state">
              <div class="avatar-saans">${icon('wind', 22)}</div>
              <div class="empty-text-wrap">
                <h2 class="welcome-title">Ask Saans Assistant</h2>
                <p class="welcome-desc">
                  Grounded advice for winter smog, room ventilation, masks, and family routines in Indian cities.
                </p>
              </div>
            </div>
            ${suggestionsMarkup}
          ` : `
            ${messagesMarkup}
            ${typingIndicator}
          `}
        </div>

        ${messages.length > 0 ? suggestionsMarkup : ''}

        <div class="chat-composer-bar">
          <form id="chat-form" class="chat-form">
            <label for="chat-input-textarea" class="sr-only">Type your question for Saans</label>
            <textarea
              id="chat-input-textarea"
              class="chat-textarea"
              placeholder="${placeholderText}"
              rows="1"
              maxlength="500"
              ${isSending ? 'disabled' : ''}
            ></textarea>

            <div class="chat-form-bottom">
              <span class="char-counter" id="chat-char-counter">0 / 500</span>
              <button
                type="submit"
                class="btn-send-message ${isSending ? 'btn-send-disabled' : ''}"
                id="btn-send-chat"
                ${isSending ? 'disabled' : ''}
                aria-label="Send message"
              >
                ${icon('arrow-right', 18)}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}
