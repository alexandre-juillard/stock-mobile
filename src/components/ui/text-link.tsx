import { Link, type Href } from 'expo-router';

import { makeStyles } from '@/hooks/use-app-theme';

interface TextLinkProps {
  href: Href;
  children: string;
}

export function TextLink({ href, children }: TextLinkProps) {
  const styles = useStyles();

  return (
    <Link href={href} style={styles.link} accessibilityRole="link">
      {children}
    </Link>
  );
}

const useStyles = makeStyles(({ colors, fonts }) => ({
  link: {
    ...fonts.labelLarge,
    color: colors.primary,
    textDecorationLine: 'underline',
    paddingVertical: 6,
  },
}));
