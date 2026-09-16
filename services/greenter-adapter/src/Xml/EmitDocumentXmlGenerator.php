<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Xml;

use DateTimeImmutable;
use Greenter\Xml\Builder\InvoiceBuilder;
use Librefact\GreenterAdapter\Domain\EmitDocumentRequest;
use Librefact\GreenterAdapter\Mapping\EmitDocumentGreenterMapper;

final class EmitDocumentXmlGenerator
{
    public function generate(EmitDocumentRequest $request): string
    {
        $invoice = (new EmitDocumentGreenterMapper())->toInvoice($request);
        $invoice->setFechaEmision(new DateTimeImmutable($request->document->issueDate . ' 00:00:00-05:00'));

        $xml = (new InvoiceBuilder())->build($invoice) ?? '';

        return $this->normalizeSunatOperationType($xml, (string) $invoice->getTipoOperacion());
    }

    private function normalizeSunatOperationType(string $xml, string $tipoOperacion): string
    {
        if ($xml === '') {
            return $xml;
        }

        $xml = str_replace(
            '<cbc:CustomizationID>2.0</cbc:CustomizationID>',
            '<cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>',
            $xml
        );

        if (strpos($xml, '<cbc:ProfileID') !== false) {
            return $xml;
        }

        $profileId = sprintf(
            '<cbc:ProfileID schemeName="SUNAT:Identificador de Tipo de Operación" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">%s</cbc:ProfileID>',
            htmlspecialchars($tipoOperacion, ENT_XML1)
        );

        return str_replace(
            '<cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>',
            '<cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>' . $profileId,
            $xml
        );
    }
}
