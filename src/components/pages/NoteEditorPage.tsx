import React from 'react';
import { useParams } from 'react-router-dom';
import { MainLayout } from '../layout/MainLayout';
import { MainEditor } from '../editor/MainEditor';

export const NoteEditorPage: React.FC = () => {
    const { noteId } = useParams<{ noteId: string }>();

    return (
        <MainLayout>
            <MainEditor noteId={noteId || "scratchpad"} />
        </MainLayout>
    );
};
