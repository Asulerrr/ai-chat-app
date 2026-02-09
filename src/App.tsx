import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  Minus, 
  Square, 
  X, 
  MessageSquare, 
  Send, 
  Maximize2,
  Minimize2,
  ChevronDown, 
  Plus,
  Bot,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Pencil,
  Pin,
  Loader2,
  Link
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- 会话数据类型 ---
interface Message {
  id: number;
  content: string;
  timestamp: number;
}

interface AISessionUrl {
  aiId: number;
  url: string;
}

interface Conversation {
  id: number;
  text: string;  // 会话标题
  pinned: boolean;
  activeAIIds: number[];  // 当时开启的 AI ID 列表
  messages: Message[];  // 用户发送的消息列表
  aiUrls: AISessionUrl[];  // 各 AI 的对话链接
  createdAt: number;  // 创建时间
}

// --- AI 输入配置 ---
// 定义每个 AI 网站的输入框、发送按钮和新建对话配置
const AI_INPUT_CONFIG: Record<string, { 
  inputSelector: string; 
  sendSelector: string; 
  inputMethod: 'value' | 'innerText' | 'clipboard' | 'google'; 
  useEnterToSend?: boolean;
  newChatSelector?: string;  // 新建对话按钮选择器
  newChatShortcut?: { key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };  // 新建对话快捷键
  newChatText?: string;  // 新建对话按钮的精确文本
  newChatUrl?: string;  // 新建对话的URL（通过跳转实现）
}> = {
  'DeepSeek': {
    // DeepSeek 使用 #chat-input 作为主输入框，需要避免匹配侧边栏元素
    inputSelector: '#chat-input, textarea[class*="chat-input"], div[class*="chat-input"] textarea, textarea[placeholder*="发送消息"]',
    sendSelector: 'div[class*="chat-input"] button, button[class*="send"], div[role="button"]',
    inputMethod: 'value',
    useEnterToSend: true,
    // DeepSeek 新建对话快捷键 Ctrl+J
    newChatShortcut: { key: 'j', ctrlKey: true }
  },
  '豆包': {
    // 豆包输入框和发送按钮
    inputSelector: 'textarea[placeholder*="聊聊天"], textarea[class*="input"], div[class*="input-area"] textarea, textarea',
    sendSelector: 'div[class*="send-btn"], button[class*="send"], div[class*="input-area"] button:last-child',
    inputMethod: 'value',
    useEnterToSend: true,
    // 豆包新建对话快捷键 Ctrl+K
    newChatShortcut: { key: 'k', ctrlKey: true }
  },
  'Kimi': {
    // Kimi 使用 contenteditable div，需要特殊处理
    inputSelector: 'div[class*="editor"][contenteditable="true"], div[data-slate-editor="true"], div[contenteditable="true"][class*="input"], div[contenteditable="true"]',
    sendSelector: 'button[data-testid="msh-chatinput-send-button"], button[class*="send"]',
    inputMethod: 'innerText',
    useEnterToSend: true,
    // Kimi 新建对话快捷键 Ctrl+K
    newChatShortcut: { key: 'k', ctrlKey: true }
  },
  '智谱AI': {
    inputSelector: 'textarea[placeholder*="聊聊天"], textarea, div[contenteditable="true"]',
    sendSelector: 'button[type="submit"], div[class*="send"]',
    inputMethod: 'value',
    // 智谱AI通过跳转URL新建对话
    newChatUrl: 'https://chatglm.cn/main/alltoolsdetail'
  },
  'Google': {
    // Google AI 使用特殊的输入框选择器和增强的输入处理
    inputSelector: 'div[role="textbox"], div[contenteditable="true"], textarea, input[type="text"]',
    sendSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[jsaction*="send"], button[aria-label*="提交"], button[data-tooltip*="发送"], button[type="submit"]',
    inputMethod: 'google',
    useEnterToSend: true,
    // Google AI 通过跳转URL新建对话
    newChatUrl: 'https://www.google.com/search?udm=50'
  },
  'Google AI': {
    // Google AI 使用特殊的输入框选择器和增强的输入处理
    inputSelector: 'div[role="textbox"], div[contenteditable="true"], textarea, input[type="text"]',
    sendSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[jsaction*="send"], button[aria-label*="提交"], button[data-tooltip*="发送"], button[type="submit"]',
    inputMethod: 'google',
    useEnterToSend: true,
    // Google AI 通过跳转URL新建对话
    newChatUrl: 'https://www.google.com/search?udm=50'
  }
};

// 获取 AI 输入配置
function getAIInputConfig(aiName: string) {
  return AI_INPUT_CONFIG[aiName] || {
    inputSelector: 'textarea, div[contenteditable="true"], input[type="text"]',
    sendSelector: 'button[type="submit"], div[role="button"]',
    inputMethod: 'value' as const,
    useEnterToSend: false,
    newChatSelector: 'button[class*="new"], div[class*="new-chat"]',
    newChatShortcut: undefined
  };
}

// 生成新建对话的 JavaScript 代码
function generateNewChatScript(config: { 
  newChatSelector?: string; 
  newChatShortcut?: { key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
  newChatText?: string;
  newChatUrl?: string;
}) {
  // 如果配置了URL，通过跳转实现新建对话
  if (config.newChatUrl) {
    return `
      (function() {
        console.log('通过URL跳转新建对话');
        // 禁用自动滚动（如果之前有对话触发的滚动）
        window.__googleAIScrollActive = false;
        window.__googleAIScrollSession = 0;
        window.location.href = '${config.newChatUrl}';
        return true;
      })();
    `;
  }
  
  // 如果配置了快捷键，优先使用快捷键
  if (config.newChatShortcut) {
    const { key, ctrlKey, shiftKey, altKey } = config.newChatShortcut;
    return `
      (function() {
        console.log('使用快捷键新建对话: ${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${key.toUpperCase()}');
        
        // 模拟键盘快捷键
        const event = new KeyboardEvent('keydown', {
          key: '${key}',
          code: 'Key${key.toUpperCase()}',
          keyCode: ${key.toUpperCase().charCodeAt(0)},
          which: ${key.toUpperCase().charCodeAt(0)},
          ctrlKey: ${ctrlKey || false},
          shiftKey: ${shiftKey || false},
          altKey: ${altKey || false},
          metaKey: false,
          bubbles: true,
          cancelable: true
        });
        
        document.dispatchEvent(event);
        document.body.dispatchEvent(event);
        
        // 部分网站需要 keyup 事件
        setTimeout(() => {
          const upEvent = new KeyboardEvent('keyup', {
            key: '${key}',
            code: 'Key${key.toUpperCase()}',
            keyCode: ${key.toUpperCase().charCodeAt(0)},
            which: ${key.toUpperCase().charCodeAt(0)},
            ctrlKey: ${ctrlKey || false},
            shiftKey: ${shiftKey || false},
            altKey: ${altKey || false},
            metaKey: false,
            bubbles: true
          });
          document.dispatchEvent(upEvent);
        }, 50);
        
        console.log('已发送快捷键');
        return true;
      })();
    `;
  }
  
  // 没有快捷键，通过按钮选择器或文本查找
  const exactText = config.newChatText || '';
  return `
    (function() {
      console.log('开始查找新建对话按钮...');
      
      // 方法1: 如果配置了精确文本，优先精确匹配
      const exactText = '${exactText}';
      if (exactText) {
        const allElements = document.querySelectorAll('button, div[role="button"], a, span, div');
        for (const el of allElements) {
          const text = (el.innerText || el.textContent || '').trim();
          // 精确匹配或以该文本开头
          if (text === exactText || text.startsWith(exactText)) {
            if (el.offsetParent !== null) {
              el.click();
              console.log('通过精确文本找到并点击:', text);
              return true;
            }
          }
        }
      }
      
      // 方法2: 通过选择器查找
      const selectors = '${config.newChatSelector || ''}'.split(', ');
      for (const selector of selectors) {
        try {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            el.click();
            console.log('通过选择器找到并点击:', selector);
            return true;
          }
        } catch(e) {}
      }
      
      // 方法3: 通过常见关键词查找
      const keywords = ['新建对话', '开启新对话', '新对话', 'New Chat', '新会话'];
      const allElements = document.querySelectorAll('button, div[role="button"], a, span, div[class*="btn"], div[class*="button"]');
      
      for (const keyword of keywords) {
        for (const el of allElements) {
          const text = (el.innerText || el.textContent || '').trim();
          if (text === keyword || (text.includes(keyword) && text.length < 20)) {
            if (el.offsetParent !== null && !el.closest('[class*="dropdown"]')) {
              el.click();
              console.log('通过关键词找到并点击:', text);
              return true;
            }
          }
        }
      }
      
      console.log('未找到新建对话按钮');
      return false;
    })();
  `;
}

// 生成 Google AI 专用的发送消息脚本
// Google AI 在发送第一条消息后页面会转换为对话模式，DOM 结构完全重建
// 需要特殊处理：重新查找输入框、使用 execCommand 插入文本、等待 DOM 稳定后再发送
function generateGoogleSendScript(text: string, config: { inputSelector: string; sendSelector: string; inputMethod: string; useEnterToSend?: boolean }) {
  return `
    (function() {
      try {
        const text = ${JSON.stringify(text)};
        console.log('[Google AI] 开始发送消息...');
        
        // 查找输入框的函数 - 每次都重新查找，避免使用过期的 DOM 引用
        function findInput() {
          // Google AI 的输入框选择器，按优先级排列
          const selectors = [
            'div[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"][aria-label]',
            'div[contenteditable="true"]',
            'textarea',
            'input[type="text"]'
          ];
          for (const selector of selectors) {
            try {
              // 使用 querySelectorAll 找到所有匹配的，选择可见的
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                if (el && el.offsetParent !== null && !el.closest('[aria-hidden="true"]')) {
                  console.log('[Google AI] ✓ 找到输入框:', selector, 'tagName:', el.tagName);
                  return el;
                }
              }
            } catch(e) {}
          }
          return null;
        }
        
        // 步骤1: 找到输入框并聚焦
        let input = findInput();
        if (!input) {
          console.error('[Google AI] ✗ 未找到输入框，等待 500ms 后重试...');
          // Google AI 页面可能还在加载/转换中，等待后重试
          setTimeout(() => {
            input = findInput();
            if (!input) {
              console.error('[Google AI] ✗ 重试后仍未找到输入框');
              return false;
            }
            doInput(input);
          }, 500);
          return true;  // 返回 true 表示正在异步处理
        }
        
        doInput(input);
        
        function doInput(inputEl) {
          // 步骤2: 聚焦并点击输入框，确保它处于编辑状态
          inputEl.focus();
          inputEl.click();
          
          // 步骤3: 等待一小段时间让焦点生效，然后输入文本
          setTimeout(() => {
            // 重新获取输入框（焦点操作可能导致 DOM 变化）
            let currentInput = findInput();
            if (!currentInput) {
              currentInput = inputEl;
            }
            
            currentInput.focus();
            
            const isContentEditable = currentInput.contentEditable === 'true' || currentInput.isContentEditable;
            
            if (isContentEditable) {
              console.log('[Google AI] 使用 contenteditable 方式输入');
              
              // 先选中所有内容（如果有的话），然后删除
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(currentInput);
              selection.removeAllRanges();
              selection.addRange(range);
              
              // 使用 execCommand 删除选中内容
              document.execCommand('delete', false);
              
              // 使用 execCommand insertText - 这是最兼容现代框架的方式
              // 它会触发框架的事件监听器（如 Angular、React 等）
              const inserted = document.execCommand('insertText', false, text);
              
              if (!inserted) {
                console.log('[Google AI] execCommand 失败，使用备选方案');
                // 备选方案：手动设置内容
                currentInput.innerHTML = '';
                const textNode = document.createTextNode(text);
                currentInput.appendChild(textNode);
                
                // 设置光标到末尾
                const newRange = document.createRange();
                newRange.selectNodeContents(currentInput);
                newRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(newRange);
                
                // 触发事件
                currentInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                currentInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }));
              }
              
              console.log('[Google AI] 输入完成, 内容:', currentInput.innerText?.substring(0, 50));
            } else if (currentInput.tagName === 'TEXTAREA' || currentInput.tagName === 'INPUT') {
              console.log('[Google AI] 使用 textarea/input 方式输入');
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set 
                || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeSetter) {
                nativeSetter.call(currentInput, text);
              } else {
                currentInput.value = text;
              }
              currentInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              currentInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
            
            // 步骤4: 等待框架处理输入，然后发送
            setTimeout(() => {
              // 重新查找输入框（确保引用最新）
              let sendInput = findInput();
              if (!sendInput) sendInput = currentInput;
              
              sendInput.focus();
              
              console.log('[Google AI] 发送 Enter 键...');
              
              // 模拟 Enter 键发送
              const enterEvent = new KeyboardEvent('keydown', { 
                key: 'Enter', 
                code: 'Enter',
                keyCode: 13, 
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true
              });
              sendInput.dispatchEvent(enterEvent);
              
              // 同时在 document 上触发
              document.dispatchEvent(new KeyboardEvent('keydown', { 
                key: 'Enter', 
                code: 'Enter',
                keyCode: 13, 
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true
              }));
              
              // keypress 事件（某些框架需要）
              sendInput.dispatchEvent(new KeyboardEvent('keypress', { 
                key: 'Enter', 
                code: 'Enter',
                keyCode: 13, 
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true
              }));
              
              // keyup 事件
              setTimeout(() => {
                const upEvent = new KeyboardEvent('keyup', { 
                  key: 'Enter', 
                  code: 'Enter',
                  keyCode: 13, 
                  which: 13,
                  bubbles: true,
                  composed: true
                });
                sendInput.dispatchEvent(upEvent);
                document.dispatchEvent(upEvent);
                console.log('[Google AI] ✓ 发送完成');
              }, 50);
              
              // 备选：如果 Enter 键没有触发发送，尝试点击发送按钮
              setTimeout(() => {
                const sendSelectors = '${config.sendSelector}'.split(', ');
                for (const selector of sendSelectors) {
                  try {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null && !btn.disabled) {
                      console.log('[Google AI] 尝试点击发送按钮:', selector);
                      btn.click();
                      break;
                    }
                  } catch(e) {}
                }
              }, 200);
              
              // 发送后短暂滚动到底部，之后不再强制滚动，让用户可以自由回看
              setTimeout(function() {
                // 找到可滚动容器并滚动到底部一次
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < allElements.length; i++) {
                  var el = allElements[i];
                  var style = window.getComputedStyle(el);
                  var overflowY = style.overflowY;
                  var isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
                  if (isScrollable && el.scrollHeight > el.clientHeight + 50) {
                    el.scrollTop = el.scrollHeight;
                  }
                }
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }, 1000);
              
            }, 150);  // 等待框架处理输入
          }, 100);  // 等待焦点生效
        }
        
        return true;
      } catch (error) {
        console.error('[Google AI] 脚本执行异常:', error);
        return false;
      }
    })();
  `;
}

// 生成发送消息的 JavaScript 代码
function generateSendScript(text: string, config: { inputSelector: string; sendSelector: string; inputMethod: string; useEnterToSend?: boolean }) {
  // Google AI 使用专用脚本
  if (config.inputMethod === 'google') {
    return generateGoogleSendScript(text, config);
  }
  
  return `
    (function() {
      try {
        const text = ${JSON.stringify(text)};
        const useEnterToSend = ${config.useEnterToSend || false};
        
        console.log('开始发送消息到 AI...');
        console.log('输入方法:', '${config.inputMethod}');
        console.log('使用Enter发送:', useEnterToSend);
      
        // 尝试找到输入框 - 按优先级查找
        const selectors = '${config.inputSelector}'.split(', ');
        let input = null;
        for (const selector of selectors) {
          try {
            const el = document.querySelector(selector);
            // 确保找到的是可见的、可交互的输入框
            if (el && el.offsetParent !== null) {
              input = el;
              console.log('✓ 找到输入框:', selector);
              break;
            }
          } catch(e) {
            console.log('✗ 选择器错误:', selector, e);
          }
        }
        
        if (!input) {
          console.error('✗ 未找到输入框，尝试的选择器:', selectors);
          console.error('当前页面URL:', window.location.href);
          console.error('当前页面标题:', document.title);
          console.error('页面HTML长度:', document.documentElement.outerHTML.length);
          return false;
        }
        
        // 聚焦输入框
        input.focus();
        input.click();
        
        // 根据输入方式设置内容
        const isContentEditable = input.contentEditable === 'true' || input.isContentEditable;
      
        // 处理输入框内容
        if ('${config.inputMethod}' === 'innerText' || isContentEditable) {
          // 对于 contenteditable 元素（如 Kimi 使用的 Slate 编辑器）
          console.log('处理 contenteditable 元素');
          
          // 清空并直接设置文本内容
          input.innerHTML = '';
          const textNode = document.createTextNode(text);
          input.appendChild(textNode);
          
          // 设置光标位置到末尾
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // 触发所有可能的事件
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }));
          input.dispatchEvent(new InputEvent('textInput', { bubbles: true, composed: true, data: text }));
          
          // 对于 React 框架，尝试触发 React 的事件系统
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'textContent')?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, text);
          }
          
          console.log('contenteditable 输入完成, 当前内容:', input.innerText?.substring(0, 50));
        } else {
          // 对于普通 textarea/input
          // 使用原生 setter 来触发 React 的事件监听
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set 
            || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, text);
          } else {
            input.value = text;
          }
          
          // 触发各种事件确保框架能检测到变化
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }));
        }
        
        console.log('已输入文本，等待发送...');
        
        // 等待框架处理后发送
        setTimeout(() => {
          // 如果配置了使用 Enter 键发送，优先使用 Enter
          if (useEnterToSend) {
            console.log('使用 Enter 键发送');
            
            // 确保输入框有焦点
            input.focus();
            
            // 模拟完整的键盘事件序列
            const enterEvent = new KeyboardEvent('keydown', { 
              key: 'Enter', 
              code: 'Enter',
              keyCode: 13, 
              which: 13,
              bubbles: true,
              cancelable: true,
              composed: true
            });
            input.dispatchEvent(enterEvent);
            document.dispatchEvent(enterEvent);
            
            // 部分网站需要 keyup 事件
            setTimeout(() => {
              const upEvent = new KeyboardEvent('keyup', { 
                key: 'Enter', 
                code: 'Enter',
                keyCode: 13, 
                which: 13,
                bubbles: true,
                composed: true
              });
              input.dispatchEvent(upEvent);
              document.dispatchEvent(upEvent);
            }, 50);
            return;
          }
          
          // 否则尝试点击发送按钮
          const sendSelectors = '${config.sendSelector}'.split(', ');
          let sendBtn = null;
          for (const selector of sendSelectors) {
            try {
              const btn = document.querySelector(selector);
              if (btn && btn.offsetParent !== null && !btn.disabled) {
                sendBtn = btn;
                console.log('找到发送按钮:', selector);
                break;
              }
            } catch(e) {}
          }
          
          if (sendBtn) {
            sendBtn.click();
            console.log('已点击发送按钮');
          } else {
            // 按钮未找到，回退到 Enter 键发送
            console.log('未找到发送按钮，使用 Enter 键发送');
            const enterEvent = new KeyboardEvent('keydown', { 
              key: 'Enter', 
              code: 'Enter',
              keyCode: 13, 
              which: 13,
              bubbles: true,
              cancelable: true
            });
            input.dispatchEvent(enterEvent);
          }
        }, 100);
        
        return true;
      } catch (error) {
        console.error('脚本执行异常:', error);
        return false;
      }
    })();
  `;
}

// --- Components ---

const WindowControls = ({ darkMode, toggleDarkMode }: { darkMode: boolean; toggleDarkMode: () => void }) => {
  const handleMinimize = () => {
    // @ts-ignore
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    // @ts-ignore
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    // @ts-ignore
    window.electronAPI?.closeWindow();
  };

  return (
    <div className={cn("flex items-center gap-4", darkMode ? "text-emerald-100/70" : "text-emerald-900/70")} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* Dark Mode Toggle */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleDarkMode}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          darkMode 
            ? "hover:text-emerald-100 hover:bg-emerald-500/20" 
            : "hover:text-emerald-900 hover:bg-emerald-500/10"
        )}
      >
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </motion.button>
      
      <div className={cn("w-[1px] h-4", darkMode ? "bg-emerald-100/20" : "bg-emerald-900/10")} />
      
      <button 
        onClick={handleMinimize}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          darkMode 
            ? "hover:text-emerald-100 hover:bg-emerald-500/20" 
            : "hover:text-emerald-900 hover:bg-emerald-500/10"
        )}
        title="最小化"
      >
        <Minus size={18} />
      </button>
      <button 
        onClick={handleMaximize}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          darkMode 
            ? "hover:text-emerald-100 hover:bg-emerald-500/20" 
            : "hover:text-emerald-900 hover:bg-emerald-500/10"
        )}
        title="最大化"
      >
        <Square size={16} />
      </button>
      <button 
        onClick={handleClose}
        className="hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
        title="关闭"
      >
        <X size={18} />
      </button>
    </div>
  );
};

const GlassPanel = ({ 
  children, 
  className, 
  intensity = 'medium',
  darkMode = false
}: { 
  children?: React.ReactNode; 
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  darkMode?: boolean;
}) => {
  const darkIntensityMap = {
    low: "bg-gray-900/95 border-white/10",
    medium: "bg-gray-900/98 border-white/15",
    high: "bg-gray-900/99 border-white/20",
  };

  return (
    <div className={cn(
      "rounded-2xl transition-all duration-500",
      darkMode ? ("border " + darkIntensityMap[intensity]) : "",
      darkMode ? "shadow-[0_4px_30px_rgba(0,0,0,0.3)]" : "shadow-sm",
      className
    )}>
      {children}
    </div>
  );
};

const HistoryItem = ({ 
  active = false, 
  text, 
  darkMode = false,
  isPinned = false,
  isEditing = false,
  editValue = '',
  onClick,
  onDelete,
  onEdit,
  onPin,
  onEditChange,
  onEditSubmit,
  showActions = false,
  onContextMenu
}: { 
  active?: boolean, 
  text: string, 
  darkMode?: boolean,
  isPinned?: boolean,
  isEditing?: boolean,
  editValue?: string,
  onClick?: () => void,
  onDelete?: () => void,
  onEdit?: () => void,
  onPin?: () => void,
  onEditChange?: (value: string) => void,
  onEditSubmit?: () => void,
  showActions?: boolean,
  onContextMenu?: (e: React.MouseEvent) => void
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "p-3 rounded-xl text-xs cursor-pointer transition-all duration-300 border relative",
        active 
          ? darkMode
            ? "bg-emerald-500/30 border-emerald-400/40 text-emerald-100 shadow-sm"
            : "bg-emerald-500/20 border-emerald-400/30 text-emerald-900 shadow-sm"
          : darkMode
            ? "bg-white/5 border-transparent text-emerald-200/70 hover:bg-white/10 hover:border-white/10"
            : "bg-white/10 border-transparent text-emerald-800/70 hover:bg-white/20 hover:border-white/20"
      )}
    >
      <div className="flex items-center gap-1">
        {isPinned && (
          <Pin size={10} className={cn(
            "shrink-0 rotate-45",
            darkMode ? "text-emerald-400" : "text-emerald-600"
          )} />
        )}
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onEditSubmit?.();
              }
              if (e.key === 'Escape') {
                onEditSubmit?.();
              }
            }}
            onBlur={onEditSubmit}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className={cn(
              "flex-1 bg-transparent border-none outline-none text-xs font-medium",
              darkMode ? "text-emerald-100" : "text-emerald-900"
            )}
          />
        ) : (
          <div className="truncate font-medium flex-1">{text}</div>
        )}
      </div>
      
      {/* 操作按钮组 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: showActions ? 1 : 0
        }}
        className={cn(
          "absolute right-1 inset-y-1 flex items-center gap-0.5 rounded-lg px-1",
          showActions ? "pointer-events-auto" : "pointer-events-none",
          showActions && (darkMode 
            ? "bg-gray-900/80" 
            : "bg-white/80")
        )}
      >
        {/* 置顶按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin?.();
          }}
          title={isPinned ? "取消置顶" : "置顶"}
          className={cn(
            "p-1 rounded transition-colors",
            isPinned
              ? darkMode 
                ? "text-emerald-400 hover:bg-emerald-500/30" 
                : "text-emerald-600 hover:bg-emerald-500/20"
              : darkMode 
                ? "text-gray-400 hover:bg-gray-700 hover:text-gray-200" 
                : "text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          )}
        >
          <Pin size={12} className={isPinned ? "rotate-45" : ""} />
        </button>
        
        {/* 修改按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          title="修改"
          className={cn(
            "p-1 rounded transition-colors",
            darkMode 
              ? "text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300" 
              : "text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-600"
          )}
        >
          <Pencil size={12} />
        </button>
        
        {/* 删除按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          title="删除"
          className={cn(
            "p-1 rounded transition-colors",
            darkMode 
              ? "text-red-400 hover:bg-red-500/30 hover:text-red-300" 
              : "text-red-500 hover:bg-red-500/20 hover:text-red-600"
          )}
        >
          <Trash2 size={12} />
        </button>
      </motion.div>
    </motion.div>
  );
};

const ChatColumn = ({ 
  title,
  aiId,
  aiUrl,
  darkMode = false,
  isExpanded = false,
  showExpandButton = true,
  allAIs = [],
  onExpand,
  onCollapse,
  onSwitchAI,
  onWebviewRef
}: { 
  title: string,
  aiId: number,
  aiUrl?: string,
  darkMode?: boolean,
  isExpanded?: boolean,
  showExpandButton?: boolean,
  allAIs?: { id: number; name: string; active: boolean }[],
  onExpand?: () => void,
  onCollapse?: () => void,
  onSwitchAI?: (fromId: number, toId: number) => void,
  onWebviewRef?: (aiId: number, ref: HTMLElement | null) => void
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);
  
  // 注册 webview 引用，并为 Google AI 注入样式
  useEffect(() => {
    if (webviewRef.current) {
      onWebviewRef?.(aiId, webviewRef.current);
      
      // 为 Google AI 的 webview 注入 CSS，确保输入框可见
      const webview = webviewRef.current as any;
      const isGoogleAI = title === 'Google AI' || title === 'Google';
      
      if (isGoogleAI && webview.addEventListener) {
        const injectGoogleCSS = () => {
          try {
            // 注入 CSS 让 Google AI 首页紧凑显示，但不影响对话模式的滚动
            webview.insertCSS(`
              /* 隐藏页脚、底部链接等不必要元素 */
              footer, #footer, .footer,
              #fbar, .fbar,
              .KxwPGc,
              #botstuff {
                display: none !important;
              }
              
              /* 减少顶部导航栏的高度 */
              #searchform, .sfbg {
                padding-top: 4px !important;
                padding-bottom: 4px !important;
              }
              
              /* 缩减 Google AI 首页大间距 */
              .SDkEP, .aajZCb, .A8SBwf, .lJ9FBc,
              .UUbT9, .logo-subtext {
                margin-top: 4px !important;
                margin-bottom: 4px !important;
                padding-top: 4px !important;
                padding-bottom: 4px !important;
              }
              
              /* 缩小 Google logo 区域 */
              .k1zIA, .lnXdpd, .jfN4p {
                height: auto !important;
                max-height: 60px !important;
                padding: 4px !important;
              }
              .lnXdpd img, .k1zIA img, .jfN4p img {
                max-height: 40px !important;
              }
            `).catch(() => {});
            
            // 执行 JS 滚动到输入框位置（仅首页）
            webview.executeJavaScript(`
              (function() {
                setTimeout(function() {
                  // 查找输入框并滚动到可见位置
                  var input = document.querySelector('textarea, div[role="textbox"], input[type="text"], .RNNXgb');
                  if (input) {
                    input.scrollIntoView({ block: 'center', behavior: 'instant' });
                  }
                }, 500);
              })();
            `).catch(() => {});
          } catch (e) {
            console.error('注入 Google AI CSS 失败:', e);
          }
        };
        
        const handleDomReady = () => {
          injectGoogleCSS();
        };
        
        const handleDidNavigate = () => {
          setTimeout(injectGoogleCSS, 300);
        };
        
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('did-navigate', handleDidNavigate);
        webview.addEventListener('did-navigate-in-page', handleDidNavigate);
        
        return () => {
          onWebviewRef?.(aiId, null);
          webview.removeEventListener('dom-ready', handleDomReady);
          webview.removeEventListener('did-navigate', handleDidNavigate);
          webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
        };
      }
    }
    return () => {
      onWebviewRef?.(aiId, null);
    };
  }, [aiId, onWebviewRef, title]);
  
  // 获取可切换的AI列表（排除当前显示的，按激活状态排序：激活的在前面）
  const availableAIs = allAIs
    .filter(ai => ai.id !== aiId)
    .sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return 0;
    });
  
  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Header inside the chat column */}
      <div className={cn(
        "flex items-center justify-between p-3 transition-colors duration-500",
        darkMode ? "text-emerald-100" : "text-emerald-900"
      )}>
        <div className="relative">
          <div 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 font-medium text-sm cursor-pointer hover:opacity-70 transition-opacity"
          >
            {title} <ChevronDown size={14} className={cn(
              "transition-transform duration-200",
              showDropdown && "rotate-180"
            )} />
          </div>
          
          {/* AI切换下拉菜单 */}
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={showDropdown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              "absolute top-full left-0 mt-1 w-44 rounded-xl border p-1.5 shadow-lg z-50",
              showDropdown ? "pointer-events-auto" : "pointer-events-none",
              darkMode 
                ? "bg-gray-900/95 border-white/10" 
                : "bg-white/95 border-gray-200"
            )}
          >
            <div className={cn(
              "text-xs px-2 py-1 mb-1",
              darkMode ? "text-gray-500" : "text-gray-400"
            )}>
              切换 / 交换 AI 模型
            </div>
            <div className="max-h-[180px] overflow-y-auto custom-scrollbar space-y-0.5">
              {availableAIs.length === 0 ? (
                <div className={cn(
                  "text-xs px-2 py-2 text-center",
                  darkMode ? "text-gray-500" : "text-gray-400"
                )}>
                  没有其他可用的 AI
                </div>
              ) : (
                availableAIs.map(ai => (
                  <div
                    key={ai.id}
                    onClick={() => {
                      onSwitchAI?.(aiId, ai.id);
                      setShowDropdown(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer",
                      ai.active
                        ? darkMode
                          ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                          : "bg-emerald-50 hover:bg-emerald-100 text-emerald-600"
                        : darkMode 
                          ? "hover:bg-white/10 text-gray-300" 
                          : "hover:bg-gray-100 text-gray-600"
                    )}
                  >
                    <Bot size={12} className={ai.active ? "text-emerald-500" : darkMode ? "text-gray-500" : "text-gray-400"} />
                    <span className="truncate flex-1">{ai.name}</span>
                    {ai.active ? (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        darkMode ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-600"
                      )}>
                        交换
                      </span>
                    ) : (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100",
                        darkMode ? "text-gray-500" : "text-gray-400"
                      )}>
                        切换
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
          
          {/* 点击外部关闭下拉菜单的遮罩 */}
          {showDropdown && (
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowDropdown(false)}
            />
          )}
        </div>
        
        {showExpandButton && (
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (isExpanded) {
                onCollapse?.();
              } else {
                onExpand?.();
              }
            }}
            className={cn(
              "p-1.5 rounded-lg transition-colors z-50",
              darkMode 
                ? "hover:bg-emerald-500/20 text-emerald-200" 
                : "hover:bg-emerald-500/10 text-emerald-800"
            )}
            title={isExpanded ? "退出全屏" : "全屏展示"}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </motion.button>
        )}
      </div>
      
      {/* Content Area - Webview for AI chat */}
      <div className={cn(
        "flex-1 relative rounded-xl mx-2 mb-2 border transition-colors duration-500 overflow-hidden",
        darkMode 
          ? "bg-white/5 border-white/5" 
          : "bg-white/5 border-white/10"
      )}>
        {aiUrl ? (
          <webview
            ref={(el: HTMLElement | null) => {
              // @ts-ignore
              webviewRef.current = el;
              onWebviewRef?.(aiId, el);
            }}
            src={aiUrl}
            className="absolute inset-0 w-full h-full"
            // @ts-ignore - webview 是 Electron 特有标签
            allowpopups="true"
            // @ts-ignore
            partition={`persist:ai-${aiId}`}
            // @ts-ignore - 使用标准 Chrome useragent，让网站认为是正常浏览器
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            // @ts-ignore - 启用 webgl 和其他功能
            enableblinkfeatures="ResizeObserver"
            // @ts-ignore - 允许跨域请求
            webpreferences="nodeIntegration=false,enableRemoteModule=false,sandbox=true"
          />
        ) : (
          <div className={cn(
            "w-full h-full flex items-center justify-center",
            darkMode ? "text-gray-500" : "text-gray-400"
          )}>
            <span className="text-sm">未设置链接</span>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  // 初始化主题：优先使用本地存储，否则跟随系统
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme !== null) {
      return savedTheme === 'dark';
    }
    // 如果没有保存的偏好，检测系统主题
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  // 标记用户是否手动设置过主题
  const [userHasSetTheme, setUserHasSetTheme] = useState(() => {
    return localStorage.getItem('theme') !== null;
  });

  // 监听系统主题变化（仅当用户没有手动设置时）
  useEffect(() => {
    if (userHasSetTheme) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setDarkMode(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [userHasSetTheme]);

  // 切换主题并保存到本地存储
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    setUserHasSetTheme(true);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  // 侧边栏展开/收起状态
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  // 输入框内容
  const [inputValue, setInputValue] = useState('');
  
  // 发送按钮抖动和提示状态
  const [showInputHint, setShowInputHint] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Webview 引用管理
  const webviewRefsMap = useRef<Map<number, HTMLElement>>(new Map());
  
  // 注册 webview 引用的回调
  const handleWebviewRef = useCallback((aiId: number, ref: HTMLElement | null) => {
    if (ref) {
      webviewRefsMap.current.set(aiId, ref);
    } else {
      webviewRefsMap.current.delete(aiId);
    }
  }, []);

  const handleSendClick = async () => {
    if (!inputValue.trim()) {
      // 无内容时抖动并显示提示
      setIsShaking(true);
      setShowInputHint(true);
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setShowInputHint(false), 2000);
    } else {
      // 有内容时发送到所有 AI
      const text = inputValue.trim();
      setInputValue('');
      setIsSending(true);
      
      // 创建新消息
      const newMessage: Message = {
        id: Date.now(),
        content: text,
        timestamp: Date.now()
      };
      
      // 更新会话：添加消息，如果是新会话则更新标题
      setConversations(prev => prev.map(c => {
        if (c.id === activeConversationId) {
          const updatedMessages = [...c.messages, newMessage];
          // 如果是新会话（标题以"新会话"开头），更新标题为第一条消息
          const newTitle = c.text.startsWith('新会话') 
            ? (text.length > 30 ? text.substring(0, 30) + '...' : text)
            : c.text;
          return { ...c, text: newTitle, messages: updatedMessages };
        }
        return c;
      }));
      
      try {
        await sendToAllAIs(text);
        
        // 延迟一段时间后捕获各 AI 的对话 URL（等待 AI 网站生成对话链接）
        const currentConvId = activeConversationId;
        setTimeout(() => {
          const urls: AISessionUrl[] = [];
          webviewRefsMap.current.forEach((webview, aiId) => {
            if (webview && 'getURL' in webview) {
              try {
                // @ts-ignore - getURL 是 Electron webview 的方法
                const url = webview.getURL();
                if (url) {
                  urls.push({ aiId, url });
                  console.log(`捕获 AI ${aiId} URL:`, url);
                }
              } catch (error) {
                console.error(`获取 AI ${aiId} URL 失败:`, error);
              }
            }
          });
          
          if (urls.length > 0) {
            setConversations(prev => prev.map(c => 
              c.id === currentConvId 
                ? { ...c, aiUrls: urls }
                : c
            ));
          }
        }, 2000);  // 等待 2 秒让 AI 网站生成对话链接
        
      } finally {
        setIsSending(false);
      }
    }
  };

  // 新建会话 - 函数声明提前，实际实现在 aiList 定义后
  const handleNewConversationRef = useRef<() => Promise<void>>();
  
  const handleNewConversation = async () => {
    if (handleNewConversationRef.current) {
      await handleNewConversationRef.current();
    }
  };

  // 历史会话数据和当前选中 - 从 localStorage 加载
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem('conversations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('加载会话列表失败:', e);
    }
    return [
      { 
        id: 1, 
        text: "新会话 1...", 
        pinned: false, 
        activeAIIds: [1, 2, 3, 4],  // 默认开启的 AI: Google AI, DeepSeek, Kimi, 智谱AI
        messages: [],
        aiUrls: [],
        createdAt: Date.now()
      },
    ];
  });
  const [activeConversationId, setActiveConversationId] = useState(() => {
    try {
      const saved = localStorage.getItem('activeConversationId');
      if (saved) return parseInt(saved, 10);
    } catch (e) {}
    return 1;
  });

  // 会话数据变化时保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    } catch (e) {
      console.error('保存会话列表失败:', e);
    }
  }, [conversations]);

  // 当前活跃会话 ID 变化时保存
  useEffect(() => {
    try {
      localStorage.setItem('activeConversationId', String(activeConversationId));
    } catch (e) {}
  }, [activeConversationId]);
  const [showActionsId, setShowActionsId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // 右键显示操作按钮
  const handleContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    setShowActionsId(showActionsId === id ? null : id);
    setEditingId(null);
  };

  // 删除会话
  const handleDeleteConversation = (id: number) => {
    const newConversations = conversations.filter(c => c.id !== id);
    setConversations(newConversations);
    setShowActionsId(null);
    
    // 如果删除的是当前选中的会话，选中第一个
    if (activeConversationId === id && newConversations.length > 0) {
      setActiveConversationId(newConversations[0].id);
    }
  };

  // 开始编辑会话
  const handleStartEdit = (id: number, currentText: string) => {
    setEditingId(id);
    setEditValue(currentText);
    setShowActionsId(null);
  };

  // 提交编辑
  const handleEditSubmit = (id: number) => {
    if (editValue.trim()) {
      setConversations(conversations.map(c => 
        c.id === id ? { ...c, text: editValue.trim() } : c
      ));
    }
    setEditingId(null);
    setEditValue('');
  };

  // 置顶/取消置顶会话
  const handlePinConversation = (id: number) => {
    setConversations(prev => {
      const updated = prev.map(c => 
        c.id === id ? { ...c, pinned: !c.pinned } : c
      );
      // 排序：置顶的在前面
      return updated.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
    });
    setShowActionsId(null);
  };

  // 点击其他地方隐藏操作按钮和AI列表
  const handleMainClick = () => {
    if (showActionsId !== null) {
      setShowActionsId(null);
    }
    if (showAIList) {
      setShowAIList(false);
    }
  };

  // 聊天列展开状态: null=多栏, string=展开的AI id
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

  // AI列表相关状态
  const [showAIList, setShowAIList] = useState(false);
  const [showAddAIModal, setShowAddAIModal] = useState(false);
  // 默认 AI 列表
  const DEFAULT_AI_LIST = [
    { id: 1, name: 'Google AI', url: 'https://www.google.com/search?udm=50', active: true, displayOrder: 1 },
    { id: 2, name: 'DeepSeek', url: 'https://chat.deepseek.com/', active: true, displayOrder: 2 },
    { id: 3, name: 'Kimi', url: 'https://kimi.moonshot.cn/', active: true, displayOrder: 3 },
    { id: 4, name: '智谱AI', url: 'https://chatglm.cn/main/alltoolsdetail', active: true, displayOrder: 4 },
    { id: 5, name: '豆包', url: 'https://www.doubao.com/chat/', active: false, displayOrder: 0 },
  ];

  // 从 localStorage 加载 AI 列表，如果没有则使用默认值
  const [aiList, setAiList] = useState(() => {
    try {
      const saved = localStorage.getItem('aiList');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('加载 AI 列表失败:', e);
    }
    return DEFAULT_AI_LIST;
  });

  // AI 列表变化时保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aiList', JSON.stringify(aiList));
    } catch (e) {
      console.error('保存 AI 列表失败:', e);
    }
  }, [aiList]);
  
  // 向所有活跃的 AI 发送消息
  const sendToAllAIs = useCallback(async (text: string) => {
    const activeAIs = aiList.filter(ai => ai.active);
    
    console.log(`[sendToAllAIs] 开始向 ${activeAIs.length} 个 AI 发送消息`);
    console.log(`[sendToAllAIs] 活跃的 AI:`, activeAIs.map(ai => ({ id: ai.id, name: ai.name })));
    
    for (const ai of activeAIs) {
      const webview = webviewRefsMap.current.get(ai.id);
      console.log(`[sendToAllAIs] 检查 AI ${ai.name} (ID: ${ai.id}):`, {
        webviewExists: !!webview,
        hasExecuteJavaScript: webview ? 'executeJavaScript' in webview : false,
        webviewType: webview ? typeof webview : 'undefined'
      });
      
      if (webview && 'executeJavaScript' in webview) {
        const config = getAIInputConfig(ai.name);
        const script = generateSendScript(text, config);
        try {
          console.log(`[sendToAllAIs] 向 ${ai.name} 执行脚本...`);
          // @ts-ignore - executeJavaScript 是 Electron webview 的方法
          const result = await webview.executeJavaScript(script);
          console.log(`[sendToAllAIs] ✓ 已向 ${ai.name} 发送消息`, result);
        } catch (error) {
          console.error(`[sendToAllAIs] ✗ 向 ${ai.name} 发送消息失败:`, error);
        }
      } else {
        console.warn(`[sendToAllAIs] ✗ AI ${ai.name} (ID: ${ai.id}) 的 webview 未找到或不支持 executeJavaScript`);
        if (webview) {
          console.warn(`[sendToAllAIs] webview 对象:`, Object.keys(webview));
        }
      }
    }
  }, [aiList]);
  
  // 向所有 AI 发送新建对话命令
  const triggerNewChatInAllAIs = useCallback(async () => {
    const activeAIs = aiList.filter(ai => ai.active);
    
    for (const ai of activeAIs) {
      const webview = webviewRefsMap.current.get(ai.id);
      if (webview && 'executeJavaScript' in webview) {
        const config = getAIInputConfig(ai.name);
        const script = generateNewChatScript(config);
        try {
          // @ts-ignore - executeJavaScript 是 Electron webview 的方法
          await webview.executeJavaScript(script);
          console.log(`已在 ${ai.name} 中新建对话`);
        } catch (error) {
          console.error(`在 ${ai.name} 中新建对话失败:`, error);
        }
      }
    }
  }, [aiList]);
  
  // 导航各 AI 到指定的 URL
  const navigateAIsToUrls = useCallback((aiUrls: AISessionUrl[]) => {
    for (const { aiId, url } of aiUrls) {
      const webview = webviewRefsMap.current.get(aiId);
      if (webview && url) {
        try {
          // @ts-ignore - 获取当前URL
          const currentUrl = webview.getURL ? webview.getURL() : webview.src;
          
          // 如果URL相同，跳过
          if (currentUrl === url) {
            console.log(`AI ${aiId} 已在目标页面`);
            continue;
          }
          
          // 优先使用 loadURL 方法
          // @ts-ignore
          if (typeof webview.loadURL === 'function') {
            // @ts-ignore
            webview.loadURL(url);
            console.log(`已通过 loadURL 导航 AI ${aiId} 到:`, url);
          } else {
            // 备选：设置 src 属性并强制刷新
            // @ts-ignore
            webview.src = url;
            // @ts-ignore
            if (typeof webview.reload === 'function') {
              // @ts-ignore
              webview.reload();
            }
            console.log(`已通过 src 导航 AI ${aiId} 到:`, url);
          }
        } catch (error) {
          console.error(`导航 AI ${aiId} 失败:`, error);
        }
      }
    }
  }, []);
  
  // 设置新建会话的实际实现
  useEffect(() => {
    handleNewConversationRef.current = async () => {
      // 保存当前会话的 AI 状态（在创建新会话前）
      const currentActiveAIIds = aiList.filter(ai => ai.active).map(ai => ai.id);
      
      const newId = Math.max(...conversations.map(c => c.id), 0) + 1;
      const newConversation: Conversation = {
        id: newId,
        text: `新会话 ${newId}...`,
        pinned: false,
        activeAIIds: currentActiveAIIds,  // 保存当前开启的 AI
        messages: [],
        aiUrls: [],  // 新会话暂无对话链接
        createdAt: Date.now()
      };
      // 新会话添加到置顶项之后
      const pinnedConvs = conversations.filter(c => c.pinned);
      const unpinnedConvs = conversations.filter(c => !c.pinned);
      setConversations([...pinnedConvs, newConversation, ...unpinnedConvs]);
      setActiveConversationId(newId);
      setInputValue('');
      
      // 如果侧边栏是收起状态，展开它
      if (!sidebarOpen) {
        setSidebarOpen(true);
      }
      
      // 触发所有 AI 新建对话
      await triggerNewChatInAllAIs();
    };
  }, [conversations, sidebarOpen, triggerNewChatInAllAIs, aiList]);
  
  // 切换会话时恢复 AI 状态
  const isSwitchingConversation = useRef(false);  // 防止循环更新
  
  const handleSwitchConversation = useCallback(async (conversationId: number) => {
    const targetConversation = conversations.find(c => c.id === conversationId);
    if (!targetConversation) return;
    
    // 标记正在切换会话
    isSwitchingConversation.current = true;
    
    // 切换到目标会话
    setActiveConversationId(conversationId);
    
    // 恢复该会话保存的 AI 状态
    if (targetConversation.activeAIIds && targetConversation.activeAIIds.length > 0) {
      setAiList(prev => prev.map(ai => ({
        ...ai,
        active: targetConversation.activeAIIds.includes(ai.id),
        // 保持 displayOrder，活跃的按原顺序排列
        displayOrder: targetConversation.activeAIIds.includes(ai.id) 
          ? targetConversation.activeAIIds.indexOf(ai.id) + 1 
          : 0
      })));
    }
    
    // 如果有保存的对话链接，导航到这些链接（恢复历史会话）
    if (targetConversation.aiUrls && targetConversation.aiUrls.length > 0) {
      // 延迟执行，等待 AI 状态更新和 webview 初始化完成
      setTimeout(() => {
        console.log('准备导航到保存的URL:', targetConversation.aiUrls);
        navigateAIsToUrls(targetConversation.aiUrls);
      }, 500);  // 增加延迟时间，确保 webview 准备好
    } else {
      // 没有保存的对话链接（新会话），触发所有 AI 新建对话
      setTimeout(async () => {
        console.log('切换到新会话，触发所有 AI 新建对话');
        await triggerNewChatInAllAIs();
      }, 500);
    }
    
    // 重置标记
    setTimeout(() => {
      isSwitchingConversation.current = false;
    }, 600);  // 增加延迟，确保导航完成后再重置
  }, [conversations, navigateAIsToUrls, triggerNewChatInAllAIs]);
  
  const [newAIName, setNewAIName] = useState('');
  const [newAIUrl, setNewAIUrl] = useState('');
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [showMaxAIHint, setShowMaxAIHint] = useState(false);
  const MAX_ACTIVE_AI = 6;

  // 根据URL自动识别AI名称
  const autoDetectName = (url: string) => {
    setIsAutoDetecting(true);
    // 模拟自动识别
    setTimeout(() => {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '');
        const namePart = hostname.split('.')[0];
        const detectedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        if (!newAIName) {
          setNewAIName(detectedName);
        }
      } catch {
        // URL无效，不做处理
      }
      setIsAutoDetecting(false);
    }, 500);
  };

  // 添加新AI
  const handleAddAI = () => {
    if (newAIName.trim() && newAIUrl.trim()) {
      const newId = Math.max(...aiList.map(a => a.id), 0) + 1;
      setAiList([...aiList, { id: newId, name: newAIName.trim(), url: newAIUrl.trim(), active: false, displayOrder: 0 }]);
      setNewAIName('');
      setNewAIUrl('');
      setShowAddAIModal(false);
    }
  };

  // 切换AI激活状态（通过AI列表勾选，新AI添加到最后位置）
  const handleToggleAIActive = (id: number) => {
    const currentAI = aiList.find(a => a.id === id);
    const activeCount = aiList.filter(a => a.active).length;
    
    // 如果要激活且已达到上限，显示提示
    if (currentAI && !currentAI.active && activeCount >= MAX_ACTIVE_AI) {
      setShowMaxAIHint(true);
      setTimeout(() => setShowMaxAIHint(false), 2500);
      return;
    }
    
    setAiList(prev => {
      const maxOrder = Math.max(...prev.filter(a => a.active).map(a => a.displayOrder || 0), 0);
      return prev.map(a => {
        if (a.id === id) {
          // 激活时分配最大displayOrder+1，取消激活时清零
          return { 
            ...a, 
            active: !a.active, 
            displayOrder: !a.active ? maxOrder + 1 : 0 
          };
        }
        return a;
      });
    });
  };

  // 删除AI
  const handleDeleteAI = (id: number) => {
    setAiList(aiList.filter(a => a.id !== id));
  };

  // 切换聊天列的AI（从一个AI切换到另一个AI，保持位置不变）
  const handleSwitchAI = (fromId: number, toId: number) => {
    const toAI = aiList.find(a => a.id === toId);
    
    // 如果目标AI已经在使用中，则交换位置
    if (toAI?.active) {
      setAiList(prev => {
        const fromAI = prev.find(a => a.id === fromId);
        const fromOrder = fromAI?.displayOrder || 0;
        const toOrder = toAI?.displayOrder || 0;
        
        return prev.map(ai => {
          if (ai.id === fromId) return { ...ai, displayOrder: toOrder };
          if (ai.id === toId) return { ...ai, displayOrder: fromOrder };
          return ai;
        });
      });
    } else {
      // 如果目标AI未使用，则替换
      setAiList(prev => {
        const fromAI = prev.find(a => a.id === fromId);
        const originalOrder = fromAI?.displayOrder || 0;
        
        return prev.map(ai => {
          if (ai.id === fromId) return { ...ai, active: false, displayOrder: 0 };
          if (ai.id === toId) return { ...ai, active: true, displayOrder: originalOrder };
          return ai;
        });
      });
    }
  };

  // 当 AI 状态变化时，更新当前会话的 activeAIIds
  useEffect(() => {
    // 如果正在切换会话，不更新（避免循环）
    if (isSwitchingConversation.current) return;
    
    const currentActiveAIIds = aiList.filter(ai => ai.active).map(ai => ai.id);
    setConversations(prev => prev.map(c => 
      c.id === activeConversationId 
        ? { ...c, activeAIIds: currentActiveAIIds }
        : c
    ));
  }, [aiList, activeConversationId]);

  return (
    <div className={cn(
      "h-screen w-full font-sans flex flex-col overflow-hidden transition-colors duration-500",
      darkMode 
        ? "bg-gradient-to-br from-[#0D1F17] via-[#0F2419] to-[#0A1A12] text-emerald-50" 
        : "bg-gradient-to-br from-[#E8F5F0] via-[#E0F2E9] to-[#D4EDE4] text-emerald-950 selection:bg-emerald-200"
    )}>
      
      {/* --- Main App Container (Full Screen) --- */}
      <div 
        onClick={handleMainClick}
        className={cn(
          "flex-1 flex flex-col overflow-hidden transition-colors duration-500",
          darkMode ? "bg-black/20" : "bg-white/10"
        )}
      >
          
          {/* --- Title Bar --- */}
          <header 
            className={cn(
              "h-14 flex items-center justify-between px-6 shrink-0 border-b transition-colors duration-500",
              darkMode ? "border-emerald-100/5" : "border-emerald-900/5"
            )}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            <div className={cn(
              "flex items-center gap-2 font-bold text-lg tracking-tight transition-colors duration-500",
              darkMode ? "text-emerald-100" : "text-emerald-900"
            )}>
              <span>AI群聊</span>
            </div>
            <WindowControls darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
          </header>

          {/* --- Main Content Area --- */}
          <div className="flex-1 flex overflow-hidden p-4 gap-4">
            
            {/* --- Left Sidebar (History) --- */}
            <motion.div
              initial={false}
              animate={{ 
                width: sidebarOpen ? 256 : 48,
                opacity: 1
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="shrink-0 overflow-hidden"
            >
              <GlassPanel 
                intensity="medium" 
                darkMode={darkMode}
                className={cn(
                  "h-full flex flex-col p-3 gap-2",
                  darkMode ? "!bg-white/10 !border-white/15" : "!bg-white/90 !border-transparent backdrop-blur-sm"
                )}
              >
                <div className={cn(
                  "flex items-center px-1 mb-2",
                  sidebarOpen ? "justify-between" : "justify-center"
                )}>
                  {sidebarOpen && (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        "text-sm font-semibold transition-colors duration-500 whitespace-nowrap",
                        darkMode ? "text-emerald-100/80" : "text-emerald-900/80"
                      )}
                    >
                      历史会话
                    </motion.span>
                  )}
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleSidebar}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      darkMode 
                        ? "text-emerald-100/50 hover:text-emerald-100 hover:bg-emerald-500/20" 
                        : "text-emerald-900/50 hover:text-emerald-900 hover:bg-emerald-500/10"
                    )}
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose size={20} className="opacity-60 hover:opacity-100 transition-opacity" />
                    ) : (
                      <PanelLeftOpen size={20} className="opacity-60 hover:opacity-100 transition-opacity" />
                    )}
                  </motion.button>
                </div>
                
                {sidebarOpen && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                  >
                    {(() => {
                      const pinnedConvs = conversations.filter(c => c.pinned);
                      const unpinnedConvs = conversations.filter(c => !c.pinned);
                      const hasPinned = pinnedConvs.length > 0;
                      const hasUnpinned = unpinnedConvs.length > 0;
                      
                      return (
                        <>
                          {/* 置顶会话 */}
                          {pinnedConvs.map((conv) => (
                            <HistoryItem 
                              key={conv.id}
                              text={conv.text} 
                              active={activeConversationId === conv.id} 
                              darkMode={darkMode}
                              isPinned={conv.pinned}
                              isEditing={editingId === conv.id}
                              editValue={editValue}
                              onClick={() => handleSwitchConversation(conv.id)}
                              onContextMenu={(e) => handleContextMenu(e, conv.id)}
                              showActions={showActionsId === conv.id}
                              onDelete={() => handleDeleteConversation(conv.id)}
                              onEdit={() => handleStartEdit(conv.id, conv.text)}
                              onPin={() => handlePinConversation(conv.id)}
                              onEditChange={setEditValue}
                              onEditSubmit={() => handleEditSubmit(conv.id)}
                            />
                          ))}
                          
                          {/* 分割线 - 仅在有置顶项且有非置顶项时显示 */}
                          {hasPinned && hasUnpinned && (
                            <div className={cn(
                              "flex items-center gap-2 py-1",
                            )}>
                              <div className={cn(
                                "flex-1 h-[1px]",
                                darkMode ? "bg-emerald-100/10" : "bg-emerald-900/10"
                              )} />
                              <span className={cn(
                                "text-[10px]",
                                darkMode ? "text-emerald-100/30" : "text-emerald-900/30"
                              )}>
                                历史
                              </span>
                              <div className={cn(
                                "flex-1 h-[1px]",
                                darkMode ? "bg-emerald-100/10" : "bg-emerald-900/10"
                              )} />
                            </div>
                          )}
                          
                          {/* 非置顶会话 */}
                          {unpinnedConvs.map((conv) => (
                            <HistoryItem 
                              key={conv.id}
                              text={conv.text} 
                              active={activeConversationId === conv.id} 
                              darkMode={darkMode}
                              isPinned={conv.pinned}
                              isEditing={editingId === conv.id}
                              editValue={editValue}
                              onClick={() => handleSwitchConversation(conv.id)}
                              onContextMenu={(e) => handleContextMenu(e, conv.id)}
                              showActions={showActionsId === conv.id}
                              onDelete={() => handleDeleteConversation(conv.id)}
                              onEdit={() => handleStartEdit(conv.id, conv.text)}
                              onPin={() => handlePinConversation(conv.id)}
                              onEditChange={setEditValue}
                              onEditSubmit={() => handleEditSubmit(conv.id)}
                            />
                          ))}
                        </>
                      );
                    })()}
                  </motion.div>
                )}
              </GlassPanel>
            </motion.div>

            {/* --- Center Chat Area --- */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              
              {/* Split View Container */}
              <GlassPanel 
                intensity="low" 
                darkMode={darkMode}
                className={cn(
                  "flex-1 flex flex-col relative overflow-hidden",
                  darkMode ? "!bg-white/10" : "!bg-white !border-emerald-100/50"
                )}
              >
                {/* 根据激活的AI动态显示 - 使用CSS控制布局，保持所有webview始终存在 */}
                {(() => {
                  const activeAIs = aiList
                    .filter(ai => ai.active)
                    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
                  const count = activeAIs.length;
                  
                  // 无激活AI时显示空状态
                  if (count === 0) {
                    return (
                      <div className="flex-1 flex items-center justify-center">
                        <div className={cn(
                          "text-center",
                          darkMode ? "text-gray-500" : "text-gray-400"
                        )}>
                          <Bot size={48} className="mx-auto mb-3 opacity-50" />
                          <p className="text-sm">请选择要使用的 AI</p>
                          <p className="text-xs mt-1 opacity-70">点击右下角按钮添加或启用 AI</p>
                        </div>
                      </div>
                    );
                  }
                  
                  // 计算每个AI的布局位置
                  const getLayoutStyle = (index: number, total: number, isExpanded: boolean): React.CSSProperties => {
                    // 如果当前AI被展开，占满全屏
                    if (isExpanded) {
                      return {
                        position: 'absolute',
                        inset: 0,
                        zIndex: 10,
                      };
                    }
                    
                    // 如果有其他AI被展开，隐藏当前AI（但保持在DOM中）
                    if (expandedColumn !== null) {
                      return {
                        position: 'absolute',
                        inset: 0,
                        opacity: 0,
                        pointerEvents: 'none',
                        zIndex: 0,
                      };
                    }
                    
                    // 正常布局模式
                    if (total === 1) {
                      return { flex: 1 };
                    }
                    
                    if (total === 2) {
                      return { flex: 1 };
                    }
                    
                    if (total === 3) {
                      return { flex: 1 };
                    }
                    
                    // 4个及以上使用 grid 布局，通过 gridArea 定位
                    if (total === 4) {
                      const areas = ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '2 / 1 / 3 / 2', '2 / 2 / 3 / 3'];
                      return { gridArea: areas[index] };
                    }
                    
                    if (total === 5) {
                      const areas = ['1 / 1 / 2 / 3', '1 / 3 / 2 / 5', '1 / 5 / 2 / 7', '2 / 1 / 3 / 4', '2 / 4 / 3 / 7'];
                      return { gridArea: areas[index] };
                    }
                    
                    // 6个
                    const areas = ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '1 / 3 / 2 / 4', '2 / 1 / 3 / 2', '2 / 2 / 3 / 3', '2 / 3 / 3 / 4'];
                    return { gridArea: areas[index] };
                  };
                  
                  // 获取容器样式
                  const getContainerStyle = (): string => {
                    if (expandedColumn !== null) {
                      return "relative flex-1";
                    }
                    if (count <= 3) {
                      return "flex flex-1";
                    }
                    // 4个及以上使用 grid
                    if (count === 4) {
                      return "grid grid-cols-2 grid-rows-2 flex-1 gap-[1px]";
                    }
                    if (count === 5) {
                      return "grid grid-cols-6 grid-rows-2 flex-1 gap-[1px]";
                    }
                    return "grid grid-cols-3 grid-rows-2 flex-1 gap-[1px]";
                  };
                  
                  return (
                    <div className={getContainerStyle()}>
                      {activeAIs.slice(0, 6).map((ai, index) => {
                        const isThisExpanded = expandedColumn === ai.id.toString();
                        const style = getLayoutStyle(index, count, isThisExpanded);
                        
                        return (
                          <React.Fragment key={ai.id}>
                            {/* 分隔线 - 仅在非展开模式且count<=3时显示 */}
                            {expandedColumn === null && count <= 3 && index > 0 && (
                              <div className={cn(
                                "w-[1px] bg-gradient-to-b from-transparent to-transparent my-4",
                                darkMode ? "via-emerald-100/10" : "via-emerald-900/10"
                              )} />
                            )}
                            <div style={style} className={cn(
                              // 展开时添加背景，确保覆盖其他内容
                              isThisExpanded && (darkMode ? "bg-[#0D1F17]" : "bg-[#E8F5F0]")
                            )}>
                              <ChatColumn 
                                title={ai.name}
                                aiId={ai.id}
                                aiUrl={ai.url}
                                darkMode={darkMode}
                                isExpanded={isThisExpanded}
                                showExpandButton={count > 1}
                                allAIs={aiList}
                                onExpand={() => setExpandedColumn(ai.id.toString())}
                                onCollapse={() => setExpandedColumn(null)}
                                onSwitchAI={handleSwitchAI}
                                onWebviewRef={handleWebviewRef}
                              />
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </GlassPanel>

              {/* Bottom Area: Input + Action Button */}
              <div className="h-20 shrink-0 flex gap-4">
              {/* Input Bar - 进一步缩短宽度，让添加AI按钮左移 */}
              <GlassPanel 
                intensity="medium" 
                darkMode={darkMode}
                className={cn(
                  "flex-[0_0_calc(100%-6rem)] flex items-center px-4 gap-3 !rounded-2xl",
                  darkMode ? "!bg-white/15" : "!bg-white/40"
                )}
              >
                  <input 
                    type="text" 
                    placeholder="问点难的，让他们多想想"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendClick();
                      }
                    }}
                    className={cn(
                      "flex-1 bg-transparent border-none outline-none text-sm h-full transition-colors duration-500",
                      darkMode 
                        ? "text-emerald-100 placeholder-emerald-100/40" 
                        : "text-emerald-900 placeholder-emerald-900/40"
                    )}
                  />
                
                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNewConversation}
                      title="新建会话"
                      className={cn(
                        "p-3 rounded-xl transition-colors",
                        darkMode 
                          ? "text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/30" 
                          : "text-emerald-800 hover:text-emerald-900 hover:bg-emerald-500/20"
                      )}
                    >
                       <MessageSquare size={24} className="stroke-[2.5]" />
                    </motion.button>

                    <div className="relative">
                      <motion.button 
                        whileHover={{ scale: 1.1, rotate: -10 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSendClick}
                        animate={isShaking ? { 
                          x: [0, -4, 4, -4, 4, -2, 2, 0],
                          transition: { duration: 0.5 }
                        } : {}}
                        disabled={isSending}
                        className={cn(
                          "p-3 rounded-xl transition-all duration-300 cursor-pointer",
                          isSending
                            ? "text-gray-400 cursor-wait"
                            : inputValue.trim()
                              ? darkMode 
                                ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20" 
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                              : darkMode
                                ? "text-pink-400 hover:text-pink-300 hover:bg-pink-500/20"
                                : "text-pink-500 hover:text-pink-600 hover:bg-pink-500/10"
                        )}
                      >
                         {isSending ? <Loader2 size={24} className="stroke-[2.5] animate-spin" /> : <Send size={24} className="stroke-[2.5]" />}
                      </motion.button>
                      
                      {/* 提示气泡 */}
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={showInputHint ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.9 }}
                        className={cn(
                          "absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap pointer-events-none",
                          darkMode 
                            ? "bg-gray-800 text-gray-200" 
                            : "bg-gray-900 text-white"
                        )}
                      >
                        请输入内容
                        <div className={cn(
                          "absolute top-full right-4 w-2 h-2 rotate-45 -translate-y-1",
                          darkMode ? "bg-gray-800" : "bg-gray-900"
                        )} />
                      </motion.div>
                    </div>
                  </div>
                </GlassPanel>

                {/* Right Action Button (Bot) - 添加AI - 进一步左移 */}
                <div className="relative">
                  <GlassPanel 
                    intensity="medium" 
                    darkMode={darkMode}
                    className={cn(
                      "h-full aspect-square !rounded-2xl flex items-center justify-center p-0",
                      darkMode ? "!bg-white/15 !border-white/15" : "!bg-white/40 !border-emerald-200/60"
                    )}
                  >
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowAIList(!showAIList)}
                      className={cn(
                        "w-full h-full rounded-2xl transition-colors flex items-center justify-center",
                        darkMode 
                          ? "text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/30" 
                          : "text-emerald-800 hover:text-emerald-900 hover:bg-emerald-500/20"
                      )}
                    >
                      <Bot size={24} className="stroke-[2.5]" />
                    </motion.button>
                  </GlassPanel>
                  
                  {/* AI列表弹出层 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={showAIList && !showMaxAIHint ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "fixed w-48 rounded-xl border p-2 shadow-2xl z-50",
                      showAIList && !showMaxAIHint ? "pointer-events-auto" : "pointer-events-none",
                      darkMode 
                        ? "bg-gray-900/95 border-white/10 backdrop-blur-xl" 
                        : "bg-white/95 border-gray-200 backdrop-blur-xl"
                    )}
                    style={{
                      bottom: showAIList ? '100px' : '100px',
                      right: showAIList ? '16px' : '16px'
                    }}
                  >
                    <div className={cn(
                      "flex items-center justify-between text-xs font-semibold px-2 py-1.5 mb-1",
                      darkMode ? "text-gray-400" : "text-gray-500"
                    )}>
                      <span>AI 列表</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        darkMode ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"
                      )}>
                        {aiList.filter(a => a.active).length}/{MAX_ACTIVE_AI}
                      </span>
                    </div>
                    
                    {/* AI列表项 - 正在使用的排在前面，显示6.5个提示下方有更多 */}
                    <div className="space-y-1 max-h-[260px] overflow-y-auto custom-scrollbar">
                      {[...aiList]
                        .sort((a, b) => {
                          if (a.active && !b.active) return -1;
                          if (!a.active && b.active) return 1;
                          return 0;
                        })
                        .map((ai) => (
                        <div
                          key={ai.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAIActive(ai.id);
                          }}
                          className={cn(
                            "flex items-center justify-between px-2 py-2 rounded-lg text-sm cursor-pointer group",
                            ai.active
                              ? darkMode
                                ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-gray-200"
                                : "bg-emerald-50 hover:bg-emerald-100 text-gray-700"
                              : darkMode 
                                ? "hover:bg-white/10 text-gray-200" 
                                : "hover:bg-gray-100 text-gray-700"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Bot size={14} className={ai.active ? "text-emerald-500" : darkMode ? "text-gray-500" : "text-gray-400"} />
                            <span className="truncate">{ai.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* 使用中标识 - 绿色勾 */}
                            {ai.active && (
                              <svg 
                                width="14" 
                                height="14" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                className="text-emerald-500"
                              >
                                <path 
                                  d="M5 13l4 4L19 7" 
                                  stroke="currentColor" 
                                  strokeWidth="3" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                            {/* 删除按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAI(ai.id);
                              }}
                              className={cn(
                                "opacity-0 group-hover:opacity-100 p-1 rounded transition-all ml-1",
                                darkMode 
                                  ? "hover:bg-red-500/20 text-red-400" 
                                  : "hover:bg-red-100 text-red-500"
                              )}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* 分隔线 */}
                    <div className={cn(
                      "my-2 h-[1px]",
                      darkMode ? "bg-white/10" : "bg-gray-200"
                    )} />
                    
                    {/* 添加按钮 */}
                    <button
                      onClick={() => {
                        setShowAddAIModal(true);
                        setShowAIList(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors",
                        darkMode 
                          ? "hover:bg-emerald-500/20 text-emerald-400" 
                          : "hover:bg-emerald-100 text-emerald-600"
                      )}
                    >
                      <Plus size={14} />
                      <span>添加 AI</span>
                    </button>
                  </motion.div>

                  {/* 最多6个AI提示 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={showMaxAIHint ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.9 }}
                    className={cn(
                      "absolute bottom-full right-0 mb-2 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap shadow-lg",
                      showMaxAIHint ? "pointer-events-auto" : "pointer-events-none",
                      darkMode 
                        ? "bg-orange-500/90 text-white" 
                        : "bg-orange-500 text-white"
                    )}
                  >
                    最多仅支持 {MAX_ACTIVE_AI} 个 AI 模型同时展示
                  </motion.div>
                  
                  {/* 点击外部关闭AI列表的遮罩 */}
                  {showAIList && (
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowAIList(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* 添加AI弹窗 */}
      {showAddAIModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAddAIModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-96 rounded-2xl border p-6 shadow-2xl",
              darkMode 
                ? "bg-gray-900/95 border-white/10 backdrop-blur-xl" 
                : "bg-white/95 border-gray-200 backdrop-blur-xl"
            )}
          >
            <h3 className={cn(
              "text-lg font-semibold mb-4",
              darkMode ? "text-white" : "text-gray-900"
            )}>
              添加新 AI
            </h3>
            
            {/* AI链接输入 */}
            <div className="mb-4">
              <label className={cn(
                "block text-sm font-medium mb-1.5",
                darkMode ? "text-gray-300" : "text-gray-700"
              )}>
                AI 链接
              </label>
              <div className="relative">
                <Link size={16} className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2",
                  darkMode ? "text-gray-500" : "text-gray-400"
                )} />
                <input
                  type="url"
                  value={newAIUrl}
                  onChange={(e) => {
                    setNewAIUrl(e.target.value);
                    if (e.target.value) {
                      autoDetectName(e.target.value);
                    }
                  }}
                  placeholder="https://example.com"
                  className={cn(
                    "w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors",
                    darkMode 
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-emerald-500" 
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
                  )}
                />
              </div>
            </div>
            
            {/* AI名称输入 */}
            <div className="mb-6">
              <label className={cn(
                "block text-sm font-medium mb-1.5",
                darkMode ? "text-gray-300" : "text-gray-700"
              )}>
                AI 名称
              </label>
              <div className="relative">
                <Bot size={16} className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2",
                  darkMode ? "text-gray-500" : "text-gray-400"
                )} />
                <input
                  type="text"
                  value={newAIName}
                  onChange={(e) => setNewAIName(e.target.value)}
                  placeholder="输入名称或自动识别"
                  className={cn(
                    "w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-colors",
                    darkMode 
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-emerald-500" 
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
                  )}
                />
                {isAutoDetecting && (
                  <Loader2 size={16} className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 animate-spin",
                    darkMode ? "text-emerald-400" : "text-emerald-600"
                  )} />
                )}
              </div>
              <p className={cn(
                "text-xs mt-1.5",
                darkMode ? "text-gray-500" : "text-gray-400"
              )}>
                输入链接后将自动识别AI名称
              </p>
            </div>
            
            {/* 按钮组 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddAIModal(false);
                  setNewAIName('');
                  setNewAIUrl('');
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  darkMode 
                    ? "bg-gray-800 hover:bg-gray-700 text-gray-300" 
                    : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                )}
              >
                取消
              </button>
              <button
                onClick={handleAddAI}
                disabled={!newAIName.trim() || !newAIUrl.trim()}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  newAIName.trim() && newAIUrl.trim()
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : darkMode
                      ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                添加
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default App;
