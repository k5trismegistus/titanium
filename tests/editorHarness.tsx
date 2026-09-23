import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProvider } from '../src/context/EditorContext';
import { MainEditor } from '../src/components/editor/MainEditor';
import '../src/index.css';

const Harness = () => {
  const [markdown, setMarkdown] = useState('# 見出し\n一行目\n二行目\n\n- 項目');
  return (
    <EditorProvider>
      <MainEditor content={markdown} setContent={setMarkdown} />
      <pre data-testid="markdown-output">{markdown}</pre>
    </EditorProvider>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
