import { render, screen } from '@testing-library/react';
import App from './App';


test('renders the AMS home page and login choices', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Smart ID Apartment Monitoring System' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manager Login' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tenant Login' })).toBeInTheDocument();
});
