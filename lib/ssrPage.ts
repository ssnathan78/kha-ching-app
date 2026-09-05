/** Pages Router pages that use `useRouter` / AppShell cannot be statically prerendered. */
export async function getServerSideProps() {
  return { props: {} }
}
