import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { ThemeProvider } from '@/theme/ThemeContext';

// Wrapper with theme
function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// ─── Button ──────────────────────────────────────────────────────────
describe('Button component', () => {
  it('renders title text', () => {
    const { getByText } = render(
      <Wrapper><Button title="Submit" onPress={() => {}} /></Wrapper>,
    );
    expect(getByText('Submit')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Wrapper><Button title="Click Me" onPress={onPress} /></Wrapper>,
    );
    fireEvent.press(getByText('Click Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Wrapper><Button title="Disabled" onPress={onPress} disabled /></Wrapper>,
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows ActivityIndicator when loading', () => {
    const { queryByText, UNSAFE_getByType } = render(
      <Wrapper><Button title="Loading..." onPress={() => {}} loading /></Wrapper>,
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders all variants without crashing', () => {
    const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
    variants.forEach((variant) => {
      const { getByText } = render(
        <Wrapper><Button title={variant} onPress={() => {}} variant={variant} /></Wrapper>,
      );
      expect(getByText(variant)).toBeTruthy();
    });
  });

  it('renders all sizes without crashing', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    sizes.forEach((size) => {
      const { getByText } = render(
        <Wrapper><Button title={size} onPress={() => {}} size={size} /></Wrapper>,
      );
      expect(getByText(size)).toBeTruthy();
    });
  });
});

// ─── Input ───────────────────────────────────────────────────────────
describe('Input component', () => {
  it('renders with label', () => {
    const { getByText } = render(
      <Wrapper><Input label="Phone Number" /></Wrapper>,
    );
    expect(getByText('Phone Number')).toBeTruthy();
  });

  it('renders error message', () => {
    const { getByText } = render(
      <Wrapper><Input error="This field is required" /></Wrapper>,
    );
    expect(getByText('This field is required')).toBeTruthy();
  });

  it('accepts text input', () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = render(
      <Wrapper>
        <Input value="9999999999" onChangeText={onChange} />
      </Wrapper>,
    );
    expect(getByDisplayValue('9999999999')).toBeTruthy();
  });

  it('shows placeholder text', () => {
    const { getByPlaceholderText } = render(
      <Wrapper><Input placeholder="Enter phone" /></Wrapper>,
    );
    expect(getByPlaceholderText('Enter phone')).toBeTruthy();
  });

  it('renders without label or error', () => {
    const { toJSON } = render(<Wrapper><Input /></Wrapper>);
    expect(toJSON()).not.toBeNull();
  });
});

// ─── StatCard ─────────────────────────────────────────────────────────
describe('StatCard component', () => {
  it('renders title and value', () => {
    const { getByText } = render(
      <Wrapper><StatCard title="Total Sales" value="₹1,23,456" /></Wrapper>,
    );
    expect(getByText('Total Sales')).toBeTruthy();
    expect(getByText('₹1,23,456')).toBeTruthy();
  });

  it('renders optional subtitle', () => {
    const { getByText } = render(
      <Wrapper>
        <StatCard title="Revenue" value="₹5,000" subtitle="This month" />
      </Wrapper>,
    );
    expect(getByText('This month')).toBeTruthy();
  });

  it('renders without subtitle', () => {
    const { queryByText } = render(
      <Wrapper><StatCard title="Items" value="42" /></Wrapper>,
    );
    expect(queryByText('This month')).toBeNull();
  });
});

// ─── EmptyState ───────────────────────────────────────────────────────
describe('EmptyState component', () => {
  it('renders title and description', () => {
    const { getByText } = render(
      <Wrapper>
        <EmptyState title="No Records" description="Add your first record" />
      </Wrapper>,
    );
    expect(getByText('No Records')).toBeTruthy();
    expect(getByText('Add your first record')).toBeTruthy();
  });

  it('renders action node when provided', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Wrapper>
        <EmptyState
          title="No Items"
          description="Nothing here yet"
          action={<Button title="Add Item" onPress={onPress} />}
        />
      </Wrapper>,
    );
    const btn = getByText('Add Item');
    expect(btn).toBeTruthy();
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
