import { useState } from 'react';
import { Link } from 'react-router-dom';

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
  const [logoError, setLogoError] = useState(false);
  const getEnvironmentBadge = () => {
    const hostname = window.location.hostname;
    if (hostname.includes('bolt.host')) {
      return { label: 'DEV (Published)', color: '#f59e0b', bgColor: '#fef3c7' };
    } else if (hostname.includes('localhost')) {
      return { label: 'LOCAL', color: '#059669', bgColor: '#d1fae5' };
    }
    return null;
  };

  const getEnvironmentSwitchLink = () => {
    const hostname = window.location.hostname;
    const currentPath = window.location.pathname + window.location.search + window.location.hash;

    if (hostname.includes('bolt.host')) {
      return {
        label: 'Ouvrir en LOCAL',
        url: `http://localhost:5173${currentPath}`,
      };
    } else if (hostname.includes('localhost')) {
      const devUrl = import.meta.env.VITE_DEV_URL;
      if (devUrl) {
        return {
          label: 'Ouvrir en DEV',
          url: `${devUrl}${currentPath}`,
        };
      }
    }
    return null;
  };

  const envBadge = getEnvironmentBadge();
  const envSwitchLink = getEnvironmentSwitchLink();

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
              font-size: 20px !important;
            }
            .app-header-subtitle {
              font-size: 11px !important;
              max-width: 120px !important;
            }
            .app-header-button {
              padding: 6px 12px !important;
              font-size: 12px !important;
            }
            .app-header-env-badge {
              display: none !important;
            }
            .app-header-env-link {
              display: none !important;
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
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
      }}>
        <div
          className="app-header-container"
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Link
              to="/app"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                color: 'inherit'
              }}
            >
              {!logoError && (
                <img
                  src="/logo_carre_comptaapp_format_png.png"
                  alt="ComptaApp Logo"
                  className="app-header-logo"
                  width="40"
                  height="40"
                  style={{
                    flexShrink: 0,
                    display: 'block'
                  }}
                  onError={() => setLogoError(true)}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <h1
                  className="app-header-title"
                  style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#1a1a1a',
                    lineHeight: '1.2',
                  }}
                >
                  {title}
                </h1>
                {subtitle && (
                  <p
                    className="app-header-subtitle"
                    style={{
                      margin: 0,
                      color: '#6b7280',
                      fontSize: '14px',
                      fontWeight: '400',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '240px',
                      lineHeight: '1.3',
                    }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </Link>
            {envBadge && (
              <span
                className="app-header-env-badge"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: envBadge.color,
                  backgroundColor: envBadge.bgColor,
                  borderRadius: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}
              >
                {envBadge.label}
              </span>
            )}
            {envSwitchLink && (
              <a
                href={envSwitchLink.url}
                className="app-header-env-link"
                style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'color 0.2s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af';
                  e.currentTarget.style.textDecoration = 'none';
                }}
              >
                {envSwitchLink.label}
              </a>
            )}
          </div>
          {showSignOut && onSignOut && (
            <button
              className="app-header-button"
              onClick={onSignOut}
              style={{
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: '500',
                color: '#374151',
                backgroundColor: 'transparent',
                border: '1px solid #374151',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#374151';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#374151';
                e.currentTarget.style.borderColor = '#374151';
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
