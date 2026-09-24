import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProvider } from '../src/context/EditorContext';
import { MainEditor } from '../src/components/editor/MainEditor';
import { useVisualViewportTop } from '../src/hooks/useVisualViewportTop';
import '../src/index.css';

const Harness = () => {
  useVisualViewportTop();
  const [markdown, setMarkdown] = useState(
    `# 見出し\n一行目\n二行目\n\n- 項目\n\n${Array.from({ length: 60 }, (_, index) => `検証用の段落 ${index + 1}`).join('\n')}`,
  );
  return (
    <EditorProvider>
      <div
        className="min-h-[100svh]"
        style={
          {
            '--global-header-height': '3.5rem',
            '--editor-header-height': '3rem',
          } as React.CSSProperties
        }
      >
        <div className="h-14 bg-white p-4">Titanium test</div>
        <div className="h-12 bg-white p-3">Note header</div>
        <div
          id="titanium-mobile-editor-toolbar"
          className="sticky z-30 lg:hidden"
          style={{ top: 'var(--visual-viewport-top, 0px)' }}
        />
        <main className="px-4 py-8">
          <div
            id="titanium-desktop-editor-toolbar"
            className="sticky z-30 mx-auto hidden max-w-2xl lg:block"
            style={{ top: 'var(--visual-viewport-top, 0px)' }}
          />
          <MainEditor content={markdown} setContent={setMarkdown} />
          <pre data-testid="markdown-output">{markdown}</pre>
        </main>
      </div>
    </EditorProvider>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
