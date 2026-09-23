import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/firebase/auth';
import { NoteList } from './components/pages/NoteList';
import { NoteEditorPage } from './components/pages/NoteEditorPage';
import { DemoPage } from './components/pages/DemoPage';
import { Header } from './components/common/Header';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Header />
                <Routes>
                    <Route path="/" element={<NoteList />} />
                    <Route path="/note/:noteId" element={<NoteEditorPage />} />
                    <Route path="/demo" element={<DemoPage />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
