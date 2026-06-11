import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { MoreHorizontal, Plus, Search, Trash2, Minus, PackageOpen, ShoppingBag } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const productSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  category: z.enum(["suplementos", "ropa", "accesorios"]),
  stock: z.coerce.number().min(0),
  sku: z.string().optional(),
  isActive: z.boolean().default(true),
});
type ProductFormData = z.infer<typeof productSchema>;
interface Product extends ProductFormData { id: string }

interface CartItem { product: Product; qty: number }

const CATEGORY_LABEL: Record<string, string> = {
  suplementos: "Suplementos",
  ropa: "Ropa",
  accesorios: "Accesorios",
};

function normalizeProduct(row: any): Product {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    price: Number(row?.price ?? 0),
    category: (row?.category ?? "accesorios") as ProductFormData["category"],
    stock: Number(row?.stock ?? 0),
    sku: String(row?.sku ?? ""),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
  };
}

// ── Catálogo de productos (CRUD) ─────────────────────────
const ProductsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, refetch } = useQuery<{ data: Product[] }>({
    queryKey: ["products", debouncedSearch],
    queryFn: async () => (await api.get(`/products?search=${debouncedSearch}`)).data,
  });
  const products = Array.isArray(data?.data) ? data.data.map(normalizeProduct) : [];

  const form = useForm<ProductFormData>({ resolver: zodResolver(productSchema), defaultValues: { isActive: true, category: "suplementos" } });

  const createMutation = useMutation({ mutationFn: (d: ProductFormData) => api.post("/products", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto creado" }); setOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: Product) => api.put(`/products/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto actualizado" }); setOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/products/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto eliminado" }); } });

  const openNew = () => { form.reset({ isActive: true, category: "suplementos" }); setEditing(null); setOpen(true); };

  const handleDelete = async (p: Product) => {
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      description: "Se elimina del catálogo y deja de aparecer en la terminal de venta.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(p.id);
  };

  return (
    <div>
      {dialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-alma-ink/55" />
          <Input className="pl-8" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" className="bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink" onClick={openNew}>
          <Plus size={14} className="mr-1" />Nuevo producto
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState
          title="No pudimos cargar los productos"
          description="Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && products.length === 0 && (
        <EmptyState
          icon={<PackageOpen size={20} strokeWidth={1.8} />}
          title={search ? "Sin resultados" : "Aún no hay productos"}
          description={search ? `No encontramos productos para "${search}".` : "Crea tu primer producto para venderlo en la terminal."}
          ctaLabel={search ? undefined : "Nuevo producto"}
          onCta={search ? undefined : openNew}
        />
      )}

      {!isLoading && !isError && products.length > 0 && (
        <div className="rounded-xl border border-alma-hairline overflow-hidden bg-alma-canvas">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-alma-ink">{p.name}</TableCell>
                  <TableCell className="text-sm text-alma-ink/55">{CATEGORY_LABEL[p.category] ?? p.category}</TableCell>
                  <TableCell className="text-right text-alma-ink nums">{formatMXN(p.price)}</TableCell>
                  <TableCell className="text-right text-alma-ink nums">{p.stock}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold",
                      p.isActive
                        ? "bg-alma-oat/60 text-alma-ink border-alma-sandstone/50"
                        : "bg-alma-mist text-alma-ink/55 border-alma-hairline",
                    )}>
                      {p.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => { form.reset(normalizeProduct(p)); setEditing(p); setOpen(true); }}>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p)}>Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Precio</Label><Input type="number" className="nums" {...form.register("price")} /></div>
              <div className="space-y-1"><Label>Stock</Label><Input type="number" className="nums" {...form.register("stock")} /></div>
            </div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as ProductFormData["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suplementos">Suplementos</SelectItem>
                  <SelectItem value="ropa">Ropa</SelectItem>
                  <SelectItem value="accesorios">Accesorios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>SKU</Label><Input {...form.register("sku")} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} /><Label>Activo</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink">{editing ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Terminal de venta ────────────────────────────────────
const POSTerminal = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discountCode, setDiscountCode] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, refetch } = useQuery<{ data: Product[] }>({
    queryKey: ["products", debouncedSearch],
    queryFn: async () => (await api.get(`/products?search=${debouncedSearch}&active=true`)).data,
  });
  const products = Array.isArray(data?.data) ? data.data.map(normalizeProduct) : [];

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === p.id);
      if (ex) return prev.map((c) => c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const remove = (id: string) => setCart((prev) => prev.filter((c) => c.product.id !== id));
  const adjustQty = (id: string, delta: number) => setCart((prev) => prev.map((c) => c.product.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  const total = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);

  const checkoutMutation = useMutation({
    mutationFn: () => api.post("/pos/checkout", {
      items: cart.map((c) => ({ productId: c.product.id, qty: c.qty })),
      paymentMethod,
      total,
      discountCode: discountCode.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Venta realizada" });
      setCart([]);
      setDiscountCode("");
    },
    onError: (err: any) => {
      toast({ title: "No se pudo completar la venta", description: err?.response?.data?.message, variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Productos */}
      <div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-alma-ink/55" />
          <Input className="pl-8" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <ErrorState
            title="No pudimos cargar los productos"
            description="Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && products.length === 0 && (
          <EmptyState
            icon={<PackageOpen size={20} strokeWidth={1.8} />}
            title="Sin productos a la venta"
            description={search ? `No encontramos productos para "${search}".` : "Agrega productos activos en la pestaña Productos."}
          />
        )}

        {!isLoading && !isError && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                className="p-3 rounded-xl border border-alma-hairline bg-alma-mist hover:bg-alma-oat/40 hover:border-alma-sandstone transition-colors text-left"
              >
                <p className="font-medium text-sm text-alma-ink">{p.name}</p>
                <p className="text-xs text-alma-ink/55">{CATEGORY_LABEL[p.category] ?? p.category}</p>
                <p className="font-semibold text-alma-ink nums mt-1">{formatMXN(p.price)}</p>
                <p className="text-xs text-alma-ink/55 nums">Stock: {p.stock}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Carrito */}
      <div className="bg-alma-mist border border-alma-hairline rounded-xl p-4 space-y-3 h-fit">
        <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/70">Carrito</h3>
        {cart.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-alma-ink/55">
            <ShoppingBag size={18} strokeWidth={1.8} />
            <p className="text-sm">Toca un producto para agregarlo</p>
          </div>
        )}
        {cart.map((item) => (
          <div key={item.product.id} className="flex items-center justify-between text-sm text-alma-ink">
            <span className="flex-1 truncate">{item.product.name}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Quitar uno" onClick={() => adjustQty(item.product.id, -1)}><Minus size={10} /></Button>
              <span className="w-5 text-center nums">{item.qty}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Agregar uno" onClick={() => adjustQty(item.product.id, 1)}><Plus size={10} /></Button>
              <span className="w-20 text-right font-medium nums">{formatMXN(item.product.price * item.qty)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" aria-label="Eliminar del carrito" onClick={() => remove(item.product.id)}><Trash2 size={10} /></Button>
            </div>
          </div>
        ))}
        {cart.length > 0 && (
          <>
            <div className="border-t border-alma-hairline pt-3 flex justify-between font-semibold text-alma-ink">
              <span>Total</span>
              <span className="nums">{formatMXN(total)}</span>
            </div>
            <div className="space-y-1">
              <Label>Método de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Código de descuento (opcional)</Label>
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="Ej. ALMA10"
              />
            </div>
            <Button className="w-full bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink font-semibold" onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
              {checkoutMutation.isPending ? "Procesando…" : "Confirmar venta"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const tabTriggerClass =
  "rounded-xl px-4 py-2 text-[13px] font-semibold text-alma-ink/70 data-[state=active]:bg-alma-oat data-[state=active]:text-alma-ink data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-alma-sandstone";

// ── Página principal POS ──────────────────────────────────
const POSPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="admin-title text-alma-ink mb-6">Punto de venta</h1>
        <Tabs defaultValue="pos">
          <TabsList className="h-auto rounded-2xl border border-alma-hairline bg-alma-mist p-1">
            <TabsTrigger value="pos" className={tabTriggerClass}>Terminal</TabsTrigger>
            <TabsTrigger value="products" className={tabTriggerClass}>Productos</TabsTrigger>
          </TabsList>
          <TabsContent value="pos" className="mt-4"><POSTerminal /></TabsContent>
          <TabsContent value="products" className="mt-4"><ProductsPage /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default POSPage;
