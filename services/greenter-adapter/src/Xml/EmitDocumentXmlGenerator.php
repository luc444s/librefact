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

        return (new InvoiceBuilder())->build($invoice) ?? '';
    }
}
