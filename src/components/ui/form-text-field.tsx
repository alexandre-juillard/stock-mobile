import { type ComponentProps } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

import { radius, spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';

interface FormTextFieldProps extends Omit<ComponentProps<typeof TextInput>, 'label'> {
  label: string;
  containerStyle?: ViewStyle;
}

export function FormTextField({ label, containerStyle, ...textInputProps }: FormTextFieldProps) {
  const styles = useStyles();

  return (
    <View style={[styles.container, containerStyle]}>
      <Text variant="labelLarge" style={styles.label}>
        {label}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={label}
        accessibilityLabel={label}
        outlineStyle={styles.outline}
        style={styles.input}
        {...textInputProps}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    gap: spacing.xs + 2,
  },
  label: {
    color: colors.onSurface,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
  },
  outline: {
    borderRadius: radius.input,
  },
}));