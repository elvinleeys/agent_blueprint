export function SiteFooter({ links }: { links: string[] }) {
  return (
    <footer>
      {links.map((link) => (
        <a key={link} href={link}>
          {link}
        </a>
      ))}
    </footer>
  );
}
