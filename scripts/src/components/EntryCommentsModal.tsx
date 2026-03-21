import { useState, useEffect } from 'react';
import { getEntryComments, addEntryComment, deleteEntryComment, getEntryHistory, AccountingEntryComment, AccountingEntryHistory } from '../utils/cabinetMode';

interface EntryCommentsModalProps {
  entryId: string;
  entryNumber: string;
  onClose: () => void;
  setToast: (toast: { message: string; type: 'success' | 'error' }) => void;
}

export function EntryCommentsModal({ entryId, entryNumber, onClose, setToast }: EntryCommentsModalProps) {
  const [comments, setComments] = useState<AccountingEntryComment[]>([]);
  const [history, setHistory] = useState<AccountingEntryHistory[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');

  useEffect(() => {
    loadData();
  }, [entryId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [commentsData, historyData] = await Promise.all([
        getEntryComments(entryId),
        getEntryHistory(entryId)
      ]);
      setComments(commentsData);
      setHistory(historyData);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await addEntryComment(entryId, newComment);
      setNewComment('');
      await loadData();
      setToast({ message: 'Commentaire ajouté', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Supprimer ce commentaire ?')) return;

    try {
      await deleteEntryComment(commentId);
      await loadData();
      setToast({ message: 'Commentaire supprimé', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'created': 'Création',
      'locked': 'Verrouillage',
      'unlocked': 'Déverrouillage',
      'updated': 'Modification'
    };
    return labels[action] || action;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '700px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
              Écriture {entryNumber}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={() => setActiveTab('comments')}
              style={{
                padding: '8px 16px',
                backgroundColor: activeTab === 'comments' ? '#3b82f6' : 'white',
                color: activeTab === 'comments' ? 'white' : '#6b7280',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Commentaires ({comments.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '8px 16px',
                backgroundColor: activeTab === 'history' ? '#3b82f6' : 'white',
                color: activeTab === 'history' ? 'white' : '#6b7280',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Historique ({history.length})
            </button>
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px'
        }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>Chargement...</p>
          ) : activeTab === 'comments' ? (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  style={{
                    marginTop: '8px',
                    padding: '8px 16px',
                    backgroundColor: newComment.trim() ? '#3b82f6' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: newComment.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  Ajouter
                </button>
              </div>

              {comments.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                  Aucun commentaire
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                          {formatDate(comment.created_at)}
                        </span>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: '2px 8px'
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                      <p style={{
                        margin: 0,
                        fontSize: '14px',
                        color: '#1f2937',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {comment.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {history.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                  Aucun historique
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <div style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: '#3b82f6',
                        borderRadius: '50%'
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#1f2937',
                          marginBottom: '4px'
                        }}>
                          {getActionLabel(item.action)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {formatDate(item.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
