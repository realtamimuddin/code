import { Highlight, GitHubLineElement, HighlightOverlay } from '../../../shared/types';

export class GitHubOverlayManager {
  private overlays = new Map<string, HighlightOverlay>();
  private highlightMode = false;
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;

  async initialize() {
    this.createOverlayContainer();
    this.setupObservers();
    this.injectStyles();
  }

  private createOverlayContainer() {
    // Remove existing container if any
    const existing = document.getElementById('crh-overlay-container');
    if (existing) {
      existing.remove();
    }

    const container = document.createElement('div');
    container.id = 'crh-overlay-container';
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10000;
    `;
    
    document.body.appendChild(container);
  }

  private setupObservers() {
    // Watch for DOM changes in the file view
    this.observer = new MutationObserver((mutations) => {
      let shouldReposition = false;
      
      mutations.forEach((mutation) => {
        // Check if code content changed
        if (mutation.target instanceof Element) {
          if (mutation.target.closest('.js-file-content') || 
              mutation.target.closest('.blob-wrapper')) {
            shouldReposition = true;
          }
        }
      });

      if (shouldReposition) {
        this.repositionHighlights();
      }
    });

    const filesContainer = document.querySelector('#files');
    if (filesContainer) {
      this.observer.observe(filesContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    // Watch for window resize
    this.resizeObserver = new ResizeObserver(() => {
      this.repositionHighlights();
    });
    
    this.resizeObserver.observe(document.body);
  }

  private injectStyles() {
    const styleId = 'crh-overlay-styles';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .crh-highlight {
        position: absolute;
        pointer-events: none;
        border-radius: 3px;
        opacity: 0.3;
        transition: opacity 0.2s ease;
        mix-blend-mode: multiply;
      }
      
      .crh-highlight:hover {
        opacity: 0.5;
      }
      
      .crh-highlight-tooltip {
        position: absolute;
        background: #1f2328;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10001;
        opacity: 0;
        transform: translateY(-100%);
        transition: opacity 0.2s ease;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      
      .crh-highlight:hover .crh-highlight-tooltip {
        opacity: 1;
      }
      
      .crh-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        z-index: 10002;
        animation: crh-slide-in 0.3s ease;
      }
      
      .crh-notification-info {
        background: #0969da;
      }
      
      .crh-notification-error {
        background: #d1242f;
      }
      
      @keyframes crh-slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      .crh-line-hover {
        background-color: rgba(9, 105, 218, 0.1) !important;
        cursor: crosshair;
      }
    `;
    
    document.head.appendChild(style);
  }

  addHighlight(highlight: Highlight) {
    const lineElement = this.findLineElement(highlight.fileName, highlight.lineNumber);
    if (!lineElement) {
      console.warn(`Could not find line ${highlight.lineNumber} in ${highlight.fileName}`);
      return;
    }

    const overlay = this.createHighlightOverlay(highlight, lineElement);
    this.overlays.set(highlight.id, overlay);
    
    const container = document.getElementById('crh-overlay-container');
    if (container) {
      container.appendChild(overlay.element);
    }
  }

  removeHighlight(highlightId: string) {
    const overlay = this.overlays.get(highlightId);
    if (overlay) {
      overlay.element.remove();
      this.overlays.delete(highlightId);
    }
  }

  syncHighlights(highlights: Highlight[]) {
    // Clear existing highlights
    this.overlays.clear();
    const container = document.getElementById('crh-overlay-container');
    if (container) {
      container.innerHTML = '';
    }

    // Add all highlights
    highlights.forEach(highlight => this.addHighlight(highlight));
  }

  private createHighlightOverlay(highlight: Highlight, lineElement: GitHubLineElement): HighlightOverlay {
    const overlay = document.createElement('div');
    overlay.className = 'crh-highlight';
    overlay.style.backgroundColor = highlight.color;
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'crh-highlight-tooltip';
    tooltip.textContent = `${highlight.username}${highlight.content ? ': ' + highlight.content : ''}`;
    overlay.appendChild(tooltip);

    this.positionOverlay(overlay, lineElement);

    return {
      id: highlight.id,
      element: overlay,
      highlight
    };
  }

  private positionOverlay(overlay: HTMLElement, lineElement: GitHubLineElement) {
    const bounds = lineElement.bounds;
    const containerBounds = document.body.getBoundingClientRect();
    
    overlay.style.left = `${bounds.left - containerBounds.left}px`;
    overlay.style.top = `${bounds.top - containerBounds.top}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
  }

  private repositionHighlights() {
    this.overlays.forEach((overlay) => {
      const lineElement = this.findLineElement(
        overlay.highlight.fileName, 
        overlay.highlight.lineNumber
      );
      
      if (lineElement) {
        this.positionOverlay(overlay.element, lineElement);
      } else {
        // Line no longer visible, hide overlay
        overlay.element.style.display = 'none';
      }
    });
  }

  private findLineElement(fileName: string, lineNumber: number): GitHubLineElement | null {
    // GitHub's file structure varies, so we need to be flexible
    const fileBlocks = document.querySelectorAll('[data-tagsearch-path], .file');
    
    for (const fileBlock of fileBlocks) {
      const fileNameElement = fileBlock.querySelector('.file-header [title], .file-info a');
      const currentFileName = fileNameElement?.textContent?.trim();
      
      if (currentFileName && fileName.endsWith(currentFileName)) {
        // Found the right file, now find the line
        const lineElements = fileBlock.querySelectorAll('tr[data-line-number]');
        
        for (const lineEl of lineElements) {
          const lineNum = parseInt(lineEl.getAttribute('data-line-number') || '0');
          if (lineNum === lineNumber) {
            const codeCell = lineEl.querySelector('td.blob-code');
            if (codeCell instanceof HTMLElement) {
              return {
                element: codeCell,
                lineNumber,
                fileName,
                bounds: codeCell.getBoundingClientRect()
              };
            }
          }
        }
      }
    }

    return null;
  }

  getLineInfoFromSelection(selection: Selection): { fileName: string; lineNumber: number } | null {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find the line element
    let lineElement = container instanceof Element ? container : container.parentElement;
    while (lineElement && !lineElement.hasAttribute('data-line-number')) {
      lineElement = lineElement.parentElement;
    }
    
    if (!lineElement) return null;
    
    const lineNumber = parseInt(lineElement.getAttribute('data-line-number') || '0');
    if (!lineNumber) return null;
    
    // Find the file name
    const fileBlock = lineElement.closest('[data-tagsearch-path], .file');
    if (!fileBlock) return null;
    
    const fileNameElement = fileBlock.querySelector('.file-header [title], .file-info a');
    const fileName = fileNameElement?.textContent?.trim();
    
    if (!fileName) return null;
    
    return { fileName, lineNumber };
  }

  toggleHighlightMode() {
    this.highlightMode = !this.highlightMode;
    
    if (this.highlightMode) {
      this.enableLineHover();
    } else {
      this.disableLineHover();
    }
  }

  private enableLineHover() {
    document.addEventListener('mouseover', this.handleLineHover);
    document.addEventListener('mouseout', this.handleLineUnhover);
  }

  private disableLineHover() {
    document.removeEventListener('mouseover', this.handleLineHover);
    document.removeEventListener('mouseout', this.handleLineUnhover);
  }

  private handleLineHover = (event: MouseEvent) => {
    const target = event.target as Element;
    const lineElement = target.closest('tr[data-line-number]');
    
    if (lineElement instanceof HTMLElement) {
      const codeCell = lineElement.querySelector('td.blob-code');
      if (codeCell) {
        codeCell.classList.add('crh-line-hover');
      }
    }
  };

  private handleLineUnhover = (event: MouseEvent) => {
    const target = event.target as Element;
    const lineElement = target.closest('tr[data-line-number]');
    
    if (lineElement instanceof HTMLElement) {
      const codeCell = lineElement.querySelector('td.blob-code');
      if (codeCell) {
        codeCell.classList.remove('crh-line-hover');
      }
    }
  };

  reset() {
    this.overlays.clear();
    const container = document.getElementById('crh-overlay-container');
    if (container) {
      container.innerHTML = '';
    }
    this.highlightMode = false;
    this.disableLineHover();
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    const container = document.getElementById('crh-overlay-container');
    if (container) {
      container.remove();
    }
    
    const styles = document.getElementById('crh-overlay-styles');
    if (styles) {
      styles.remove();
    }
    
    this.disableLineHover();
  }
}