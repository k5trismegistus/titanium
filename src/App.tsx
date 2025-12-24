import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/firebase/auth';
import { NoteList } from './components/pages/NoteList';
import { NoteEditorPage } from './components/pages/NoteEditorPage';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<NoteList />} />
                    <Route path="/note/:noteId" element={<NoteEditorPage />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
