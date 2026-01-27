import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        padding: '16px 20px',
        backgroundColor: type === 'success' ? '#d1fae5' : '#fee2e2',
        border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}`,
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '400px',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '20px' }}>
        {type === 'success' ? '✓' : '✕'}
      </span>
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: '500',
          color: type === 'success' ? '#065f46' : '#991b1b',
        }}
      >
        {message}
      </p>
      <button
        onClick={onClose}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          color: type === 'success' ? '#065f46' : '#991b1b',
          padding: '0',
          lineHeight: '1',
        }}
      >
        ×
      </button>
    </div>
  );
}
