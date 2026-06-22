import type { CSSProperties } from 'react';

interface Props {
  value?: string | number;
  type?: string;
  showIcon?: boolean;
  onChange?: (value: string) => void;
  style?: CSSProperties;
}

export default function Input({ value = '', type = 'text', showIcon = false, onChange, style }: Props) {
  return (
    <>
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
      <div style={style} data-non-interactive="true">
        <label
          aria-label="X-position"
          style={{
            margin: '1px 0',
            display: 'flex',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            border: '1px solid transparent',
            height: 'var(--spacer-4)',
            borderRadius: 'var(--radius-medium)',
            alignItems: 'center',
            gap: '4px',
            width: '100%',
          }}
        >
          {showIcon && (
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 'var(--spacer-4)', width: 'var(--spacer-4)', flex: '0 0 var(--spacer-4)',
              color: 'var(--figma-color-icon-secondary)', marginLeft: '-1px',
              pointerEvents: 'none', fontWeight: '400',
            }}>X</span>
          )}
          <input
            type={type}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            spellCheck={false}
            style={{
              height: 'var(--spacer-4)', display: 'flex', margin: '0', padding: '0 7px',
              border: '1px solid transparent', borderLeft: '0', borderRight: '0',
              width: '100%', outline: 'none', backgroundColor: 'transparent',
              color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', minWidth: '0',
            }}
          />
        </label>
      </div>
    </>
  );
}
