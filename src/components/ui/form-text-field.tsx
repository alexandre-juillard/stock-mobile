import { type ComponentProps } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';

interface FormTextFieldProps extends Omit<ComponentProps<typeof TextInput>, 'label'> {
  label: string;
  containerStyle?: ViewStyle;
}

export function FormTextField({ label, containerStyle, ...textInputProps }: FormTextFieldProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, containerStyle]}>
      <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
        {label}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={label}
        outlineStyle={styles.outline}
        style={styles.input}
        {...textInputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'transparent',
  },
  outline: {
    borderRadius: 10,
  },
});

