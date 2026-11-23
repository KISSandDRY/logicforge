import React from 'react';
import { Link } from 'react-router-dom';
import { getButtonClassName } from './Button';
import { Modal } from './Modal';

export interface AuthGateModalProps {
  featureName: string | null;
  onClose: () => void;
  testId: string;
  extraNote?: string;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  featureName,
  onClose,
  testId,
  extraNote,
}) => (
  <Modal
    open={Boolean(featureName)}
    onClose={onClose}
    title="Потрібна авторизація"
    subtitle="Ця можливість доступна лише зареєстрованим користувачам."
    maxWidthClass="max-w-md"
  >
    <div className="space-y-3 text-xs text-win-ink" data-testid={testId}>
      <p className="leading-relaxed">
        Для дії <strong>«{featureName}»</strong> увійдіть у наявний обліковий запис або зареєструйте
        новий акаунт інженера.
        {extraNote ? ` ${extraNote}` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link to="/login" className={getButtonClassName('primary', 'sm')}>
          Увійти в акаунт →
        </Link>
        <Link to="/register" className={getButtonClassName('secondary', 'sm')}>
          Реєстрація →
        </Link>
      </div>
    </div>
  </Modal>
);
