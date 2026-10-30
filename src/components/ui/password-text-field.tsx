import { useState, type ComponentProps } from 'react';
import { TextInput } from 'react-native-paper';

import { FormTextField } from '@/components/ui/form-text-field';

type PasswordTextFieldProps = Omit<
  ComponentProps<typeof FormTextField>,
  'right' | 'secureTextEntry' | 'autoComplete'
>;

export function PasswordTextField(props: PasswordTextFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <FormTextField
      {...props}
      secureTextEntry={!isPasswordVisible}
      autoComplete="password"
      right={
        <TextInput.Icon
          icon={isPasswordVisible ? 'eye-off' : 'eye'}
          onPress={() => setIsPasswordVisible((currentValue) => !currentValue)}
        />
      }
    />
  );
}


