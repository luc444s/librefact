<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Mapping;

use DateTimeImmutable;
use Greenter\Model\Client\Client;
use Greenter\Model\Company\Address as GreenterAddress;
use Greenter\Model\Company\Company;
use Greenter\Model\Sale\FormaPagos\FormaPagoContado;
use Greenter\Model\Sale\Invoice;
use Greenter\Model\Sale\SaleDetail;
use Librefact\GreenterAdapter\Domain\DocumentItem;
use Librefact\GreenterAdapter\Domain\EmitDocumentRequest;

final class EmitDocumentGreenterMapper
{
    public function toInvoice(EmitDocumentRequest $request): Invoice
    {
        return (new Invoice())
            ->setUblVersion('2.1')
            ->setTipoOperacion('0101')
            ->setTipoDoc('01')
            ->setSerie($request->document->serie)
            ->setCorrelativo((string) $request->document->number)
            ->setFechaEmision(new DateTimeImmutable($request->document->issueDate))
            ->setTipoMoneda($request->document->currency)
            ->setCompany($this->toCompany($request))
            ->setClient($this->toClient($request))
            ->setFormaPago(new FormaPagoContado())
            ->setDetails(array_map(fn (DocumentItem $item): SaleDetail => $this->toDetail($item), $request->items))
            ->setValorVenta($request->totals->taxable)
            ->setSubTotal($request->totals->total)
            ->setMtoOperGravadas($request->totals->taxable)
            ->setMtoIGV($request->totals->igv)
            ->setTotalImpuestos($request->totals->igv)
            ->setMtoImpVenta($request->totals->total);
    }

    private function toCompany(EmitDocumentRequest $request): Company
    {
        $company = (new Company())
            ->setRuc($request->issuer->ruc)
            ->setRazonSocial($request->issuer->legalName);

        if ($request->issuer->address !== null) {
            $company->setAddress($this->toGreenterAddress($request->issuer->address));
        }

        return $company;
    }

    private function toGreenterAddress(\Librefact\GreenterAdapter\Domain\Address $address): GreenterAddress
    {
        return (new GreenterAddress())
            ->setUbigueo($address->ubigueo)
            ->setCodigoPais($address->codigoPais)
            ->setDepartamento($address->departamento)
            ->setProvincia($address->provincia)
            ->setDistrito($address->distrito)
            ->setUrbanizacion($address->urbanizacion)
            ->setDireccion($address->direccion)
            ->setCodLocal($address->codLocal);
    }

    private function toClient(EmitDocumentRequest $request): Client
    {
        return (new Client())
            ->setTipoDoc($request->customer->documentType)
            ->setNumDoc($request->customer->documentNumber)
            ->setRznSocial($request->customer->legalName);
    }

    private function toDetail(DocumentItem $item): SaleDetail
    {
        $taxable = $item->unitValue * $item->quantity;

        return (new SaleDetail())
            ->setUnidad('ZZ')
            ->setCodProducto('SERVICE')
            ->setDescripcion($item->description)
            ->setCantidad($item->quantity)
            ->setMtoValorUnitario($item->unitValue)
            ->setMtoBaseIgv($taxable)
            ->setPorcentajeIgv(18.0)
            ->setIgv($item->igv)
            ->setTipAfeIgv('10')
            ->setTotalImpuestos($item->igv)
            ->setMtoPrecioUnitario($item->total / $item->quantity)
            ->setMtoValorVenta($taxable);
    }
}
