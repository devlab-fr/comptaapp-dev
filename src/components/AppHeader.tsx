interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showSignOut?: boolean;
  onSignOut?: () => void;
}

export default function AppHeader({
  title = 'ComptaApp',
  subtitle,
  showSignOut = true,
  onSignOut
}: AppHeaderProps) {
  return (
    <>
      <style>
        {`
          @media (max-width: 640px) {
            .app-header-container {
              padding: 12px 16px !important;
            }
            .app-header-logo {
              width: 36px !important;
              height: 36px !important;
            }
            .app-header-title {
              font-size: 22px !important;
            }
            .app-header-subtitle {
              font-size: 12px !important;
            }
            .app-header-button {
              padding: 6px 12px !important;
              font-size: 13px !important;
            }
          }
        `}
      </style>
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}>
        <div
          className="app-header-container"
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/comptaapp-icon.png"
              alt="ComptaApp"
              className="app-header-logo"
              width="40"
              height="40"
              style={{ flexShrink: 0, borderRadius: '6px' }}
            />
            <div>
              <h1
                className="app-header-title"
                style={{
                  margin: 0,
                  fontSize: '28px',
                  fontWeight: '700',
                  color: '#1a1a1a',
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  className="app-header-subtitle"
                  style={{
                    margin: '2px 0 0',
                    color: '#6b7280',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '200px',
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {showSignOut && onSignOut && (
            <button
              className="app-header-button"
              onClick={onSignOut}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#dc2626',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f2';
                e.currentTarget.style.borderColor = '#fecaca';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              Se déconnecter
            </button>
          )}
        </div>
      </header>
    </>
  );
}
